import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpResponse, HttpErrorResponse
} from '@angular/common/http';

import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import * as opentracing from 'opentracing';

/** Pass untouched request through to the next request handler. */
@Injectable()
export class TracerInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler):
    Observable<HttpEvent<any>> {
    const carrier = {};
    const span = opentracing.globalTracer().startSpan(this.getName(req) + '_test2');
    opentracing.globalTracer().inject(span.context(), opentracing.FORMAT_HTTP_HEADERS, carrier);
    console.log('intercepting stuff');

    return next.handle(req)
    .pipe(
        tap(
            (event: HttpEvent<any>) => {
                if (event instanceof HttpResponse) {
                    span.log(event.body);
                }
            },
            (event: HttpErrorResponse) => {
                if (event instanceof HttpErrorResponse) {
                    span.setTag('error', true);
                    span.log(event);
                }
            }
          ),
        finalize(() => {
            span.finish();
        })
    );
  }

  getName(req: HttpRequest<any>): string {
    if (req.headers.has('tracingOperationName')) {
        return req.headers.get('tracingOperationName');
    } else {
        return req.url;
    }
  }
}
