import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';

@Controller('quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotationService.findOne(id);
  }

  @Patch(':id/approve')
  approveAndConvert(@Param('id') id: string) {
    return this.quotationService.approveAndConvert(id);
  }
}
