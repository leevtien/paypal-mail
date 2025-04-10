import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { google } from 'googleapis';
import * as fs from 'fs';

@Injectable()
export class PaypalService {
  private logger = new Logger(PaypalService.name);
  private oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  constructor() {
    this.oauth2Client.setCredentials({
      refresh_token: process.env.REFRESH_TOKEN
      
    });
  }

  async getAccessToken(): Promise<string> {
    const { token } = await this.oauth2Client.getAccessToken();
    if (!token) {
        throw new Error('Failed to retrieve access token');
      }
      
      return token;
  }
  

  async findPayPalMoneyEmails(days = 30, maxResults = 50) {
    const accessToken = await this.getAccessToken();

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        accessToken
      }
    });

    await client.connect();
    await client.mailboxOpen('INBOX');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const searchResults = await client.search({
      from: 'service@paypal.de',
      subject: "You've got money",
      since
    });
    const results: {
        id: number;
        date: Date;
        amount: string | null;
        transactionId: string | null;
        senderName: string | null;
        transactionNote: string | null;
      }[] = [];

    const uids = searchResults.slice(0, maxResults);
    

    for await (const message of client.fetch(uids, { source: true, uid: true })) {
      const parsed = await simpleParser(message.source);
      results.push({
        id: message.uid,
        date: parsed.date ?? new Date(),
        transactionId: this.extractTransactionId(parsed.text ?? ''),
        amount: this.extractAmount(parsed.text ?? ''),
        senderName: this.extractSenderName(parsed.text ?? '', parsed.subject ?? ''),
        transactionNote: this.extractTransactionNote(parsed.text ?? ''),
      });
    }

    await client.logout();
    return results;
  }

  extractTransactionId(text: string) {
    const match = text.match(/Transaction ID:?\s*([A-Z0-9]+)/i);
    return match?.[1] ?? null;
  }

  extractAmount(text: string) {
    const matches = text.match(/Amount:?\s*([\d,.]+\s*[$€£]|[$€£]\s*[\d,.]+)/i) ||
                    text.match(/([\d,.]+\s*[$€£]\s*[A-Z]{3}|[$€£]\s*[\d,.]+\s*[A-Z]{3})/i) ||
                    text.match(/([\d,.]+\s*EUR|EUR\s*[\d,.]+)/i) ||
                    text.match(/([\d,.]+\s*USD|USD\s*[\d,.]+)/i) ||
                    text.match(/Betrag:?\s*([\d,.]+\s*[$€£]|[$€£]\s*[\d,.]+)/i);
    
    return matches ? matches[1].trim() : null;
  }
  extractSenderName(text, subject) {
    // Try to extract from subject first (common format: "You've got money from John Doe")
    const subjectMatches = subject.match(/You['']ve got money from (.+)/i);
    if (subjectMatches) {
      return subjectMatches[1].trim();
    }
    
    // Try to extract from the email body
    const textMatches = text.match(/von:?\s*([^<\n\r]+)/i) ||
                       text.match(/from:?\s*([^<\n\r]+)/i) ||
                       text.match(/([^<\n\r]+) sent you money/i);
    
    return textMatches ? textMatches[1].trim() : null;
  }
  
  extractTransactionNote(text: string) {
    // Looking for the pattern: quote marker -> content -> quote marker
    const pattern = /quote\s*(?:\[.*?\])?\s*\n\s*(.*?)\s*\n\s*quote/s;
    const match = text.match(pattern);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Fallback pattern if the first one doesn't match
    const fallbackPattern = /Note from .+?:\s*\n\s*(?:quote\s*(?:\[.*?\])?\s*\n\s*)?(.*?)\s*\n\s*(?:quote|Transaction)/s;
    const fallbackMatch = text.match(fallbackPattern);
    
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1].trim();
    }
    
    return "Note not found";
  }
  
}
