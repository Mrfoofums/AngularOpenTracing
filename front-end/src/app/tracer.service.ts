import { Injectable } from '@angular/core';
import * as lightstepTracer from 'lightstep-tracer';
import * as opentracing from 'opentracing';

@Injectable({
  providedIn: 'root'
})
export class TracerService {

  constructor() {
    // Put your Access/Project Token in your env config for prod
    this.initGlobalTracer('RnzDxIY+VyZTGAxOFWq198j7EW9kqT4bP3j0Shd1sR9Fy1x4xf0mJSM53OFO3+bC2RhgiaPqtMzcUNhStx5BJ4y6bXxLc1QhVte79+BU', 'angular');
   }

   // Due to the xhr_instrumentation flag being true, all http calls will be traced
   initGlobalTracer(accessToken: string, componentName: string) {
    const options: lightstepTracer.TracerOptions = {
      access_token: accessToken,
      component_name: componentName,
      xhr_instrumentation: true
    };

    opentracing.initGlobalTracer( new lightstepTracer.Tracer(options));
   }
}
