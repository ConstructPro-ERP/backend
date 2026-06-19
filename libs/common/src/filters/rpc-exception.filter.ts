import {
  Catch,
  RpcExceptionFilter,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch(RpcException)
export class AllRpcExceptionFilter implements RpcExceptionFilter<RpcException> {
  catch(exception: RpcException, _host: ArgumentsHost): Observable<never> {
    const error = exception.getError();
    const message =
      typeof error === 'string'
        ? error
        : ((error as { message?: string }).message ?? 'Internal error');
    return throwError(() => ({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
    }));
  }
}
