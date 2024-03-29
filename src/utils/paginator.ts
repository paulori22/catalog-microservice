import {RequestContext} from '@loopback/rest';
import {Exclude, Expose, instanceToPlain} from 'class-transformer';
import {stringify} from 'qs';

export class PaginatorSerializer<T = any> {
  @Exclude()
  baseUrl: string;
  constructor(
    public results: T[],
    public count: number,
    public limit: number,
    public offset: number,
  ) {}

  @Expose()
  get previous_url() {
    let previous: string | null = null;
    if (this.offset > 0 && this.count) {
      previous = `${this.baseUrl}?${stringify({
        filter: {
          limit: this.limit,
          ...(this.offset - this.limit > 0 && {
            offset: this.offset - this.limit,
          }),
        },
      })}`;
    }
    return previous;
  }

  @Expose()
  get next_url() {
    let next: string | null = null;
    if (this.offset + this.limit < this.count) {
      next = `${this.baseUrl}?${stringify({
        filter: {
          limit: this.limit,
          ...(this.offset >= 0 &&
            this.limit >= 0 && {
              offset: this.offset + this.limit,
            }),
        },
      })}`;
    }
    return next;
  }

  toJson(req: RequestContext) {
    this.baseUrl = `${req.requestedBaseUrl}${req.request.url}`.split('?')[0];
    return instanceToPlain(this);
  }
}
