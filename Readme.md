# Tracing in Angular - Forrest Knight
Sending data to LightStep in an Angular app only takes a few lines of code and by essentially following the [cookbook](https://github.com/lightstep/lightstep-tracer-javascript). We are going to utilize the ```xhr_instrumentation:true``` flag to trace all XHR calls and get free contex propogation. Woo!

### Notes
testapp-1 and testapp-2 are spring boot apps that you can use to test full stack traces. CD into those directories and do ```gradle bootRun```. Test app 1, and then 2, in that order. Make sure to update your AccessToken/ProjectToken

1) First add opentracing and the lightstep tracer to your project ```npm install --save lightstep-tracer opentracing```
2) Create a new service called Traver service that looks like below - ```ng g service tracer```

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import * as lightstepTracer from 'lightstep-tracer';
import * as opentracing from 'opentracing';

@Injectable({
  providedIn: 'root'
})
export class TracerService {

  constructor() {
    // Put your Access/Project Token in your env config for prod
    this.initGlobalTracer('YOUR_ACCESS_TOKEN', 'Angular');
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
```

3) Inject this service into your AppComponent's constructor so that you get out of the box instrumentation

```typescript
import { Component } from '@angular/core';
import { TracerService } from './tracer.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'front-end';

  constructor(private trace: TracerService) {

  }
}
```

### So what exactly is happening
1. The AppComponent is always loaded first, assuming you haven't done something crazy with your app. In this way we can be sure that regardless of what component we fetch data in, it will be traced.
2. Our TracerServices's contructor initializes our Open Tracing Global Tracer with the proper settings to send data into LightStep


### Manual instrumentation
Again, by more or less following the cookbook, we can do something like this in any component.

```typescript
import { Component, OnInit } from '@angular/core';
import { TracerService } from '../tracer.service';
import { Observable, Observer } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import * as opentracing from 'opentracing';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  result: any;
  url = 'http://localhost:8080';
  constructor(private http: HttpClient) {

    const span = opentracing.globalTracer().startSpan('Get:80');
    this.http.get(this.url).subscribe((data) => {
      this.result = data;
      span.log({response : this.result});
    },

    error => {
      this.result = error;
      span.setTag('error', true);
      span.log({data: this.result});
    },
    () => {
      span.finish();
    });
  }

  ngOnInit() {
  }

}
```


# Using The Interceptor
// Add in a bunch of stuff