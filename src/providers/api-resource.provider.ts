import {Provider, inject} from '@loopback/core';
import {OperationRetval, RequestContext, Response, Send} from '@loopback/rest';
import {instanceToPlain} from 'class-transformer';
import {PaginatorSerializer} from '../utils/paginator';

export class ApiResourceProvider implements Provider<Send> {
  constructor(@inject.context() public request: RequestContext) {}
  value() {
    return (response: Response, result: OperationRetval) => {
      if (result) {
        response.json(
          result instanceof PaginatorSerializer
            ? result.toJson(this.request)
            : instanceToPlain(result),
        );
      }
      response.end();
    };
  }
}
