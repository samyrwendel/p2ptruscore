import { Module } from '@nestjs/common';
import { TelegramKeyboardService } from './telegram-keyboard.service';
import { PopupStateService } from './popup-state.service';

@Module({
  imports: [],
  providers: [TelegramKeyboardService, PopupStateService],
  exports: [TelegramKeyboardService, PopupStateService],
})
export class TelegramSharedModule {}
