import { Controller, Get, Query } from '@nestjs/common';
import { PaypalService } from './paypal.service';

@Controller('paypal')
export class PaypalController {
  constructor(private readonly paypalService: PaypalService) {}

  @Get('emails')
  async getPaypalEmails(@Query('days') days: string) {
    const result = await this.paypalService.findPayPalMoneyEmails(Number(days || 1));
    return result;
  }
}
