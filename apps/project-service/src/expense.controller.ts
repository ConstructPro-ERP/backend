import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseService } from './expense.service';

@ApiTags('Expenses')
@ApiBadRequestResponse({ description: 'Invalid expense request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient expense permissions' })
@ApiNotFoundResponse({ description: 'Project or expense not found' })
@Controller()
export class ExpenseController {
  constructor(private readonly expenses: ExpenseService) {}

  @Post('projects/:projectId/expenses')
  @ApiOperation({ summary: 'Record a project expense' })
  @ApiCreatedResponse({ description: 'Expense created successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateExpenseDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.create(projectId, dto, actorId);
  }

  @Get('projects/:projectId/expenses')
  @ApiOperation({ summary: 'List and filter project expenses' })
  @ApiOkResponse({ description: 'Paginated project expenses' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ExpenseQueryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.findAll(projectId, query, actorId);
  }

  @Get('projects/:projectId/expenses/summary')
  @ApiOperation({ summary: 'Get project expense totals by category' })
  @ApiOkResponse({ description: 'Project expense summary' })
  summary(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.summary(projectId, actorId);
  }

  @Get('expenses/:id')
  @ApiOperation({ summary: 'Get an expense by ID' })
  @ApiOkResponse({ description: 'Expense details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.findOne(id, actorId);
  }

  @Patch('expenses/:id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiOkResponse({ description: 'Expense updated successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.update(id, dto, actorId);
  }

  @Delete('expenses/:id')
  @ApiOperation({ summary: 'Delete an expense' })
  @ApiOkResponse({ description: 'Expense deleted successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.expenses.remove(id, actorId);
  }
}
