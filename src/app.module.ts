import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaypalModule } from './paypal/paypal.module';

@Module({
  imports: [PaypalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
