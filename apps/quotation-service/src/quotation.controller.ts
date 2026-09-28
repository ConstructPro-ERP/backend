import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { ApproveQuotationDto } from './dto/approve-quotation.dto';
import { GetQuotationsQueryDto } from './dto/get-quotations-query.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';

@Controller('quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationService.create(dto);
  }

  @Get()
  findAll(@Query() query: GetQuotationsQueryDto) {
    return this.quotationService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotationService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotationService.update(id, dto);
  }

  @Patch(':id/approve')
  approveAndConvert(@Param('id') id: string, @Body() dto: ApproveQuotationDto) {
    return this.quotationService.approveAndConvert(id, dto);
  }
}
