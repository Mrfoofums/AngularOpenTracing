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


# Creating an Interceptor
Tracing each and every API call can be a pain. While you might handle certain request differently than others, it is very likely that you have a general pattern for dealing with the data. 

Implementing tracing as an ```HttpInterceptor``` is a far better method within Angular to handle API request, and we can do it all within a single file.

## Set Up
We are going to reuse our ```initGlobalTracer()``` and constructor from earlier, but let's make a new class called ```TracerInterceptor``` that implements ```HttpInterceptor```. You can put this anywhere, I put mine inside of an interceptors/ folder. Your class will have errors as you haven't implemented the interface yet, that's okay.

```Typescript
import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpResponse, HttpErrorResponse
} from '@angular/common/http';

import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import * as opentracing from 'opentracing';
import * as lightstepTracer from 'lightstep-tracer';

@Injectable()
export class TracerInterceptor implements HttpInterceptor {

  constructor() {
    this.initGlobalTracer('84614595d97865a0dc71229ff7f50d1e', 'TraceInterceptor');
   }

   initGlobalTracer(accessToken: string, componentName: string) {
    const options: lightstepTracer.TracerOptions = {
      access_token: accessToken,
      component_name: componentName
    };
    opentracing.initGlobalTracer( new lightstepTracer.Tracer(options));
   }
}
```
Because this is an Interceptor, we will need to provide it to our application. This is a very standardly configured example app so we will provide our interceptor in our ```AppModule```. Feel free to put your wherever, but don't get stuck at this part, we're just setting up.

```Typescript
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { HttpClientModule, HTTP_INTERCEPTORS} from '@angular/common/http';
import { TracerInterceptor } from './interceptor/tracer.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule
  ],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: TracerInterceptor, multi: true }, ],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

Cool, so now we need to implement 
```Typescript
intercept(req: HttpRequest<any>, next: HttpHandler):
    Observable<HttpEvent<any>> {}
```
Feel free to copy and paste the following three functions and then I'll talk about what I'm doing here

```Typescript
intercept(req: HttpRequest<any>, next: HttpHandler):
    Observable<HttpEvent<any>> {
    const span = opentracing.globalTracer().startSpan(this.getName(req));
    const tracedReq = this.injectContext(span, req);
    return next.handle(tracedReq)
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

  injectContext(span: opentracing.Span, req: HttpRequest<any> ): HttpRequest<any> {
    const carrier = {};
    opentracing.globalTracer().inject(span.context(), opentracing.FORMAT_TEXT_MAP, carrier);
    const clone = req.clone({
      headers: req.headers
      .set('ot-tracer-sampled', carrier['ot-tracer-sampled'])
      .set('ot-tracer-spanid', carrier['ot-tracer-spanid'])
      .set('ot-tracer-traceid', carrier['ot-tracer-traceid'])
    });
    return clone;
  }

  getName(req: HttpRequest<any>): string {
    if (req.headers.has('traceOperationName')) {
        return req.headers.get('traceOperationName');
    } else {
        return req.url;
    }
  }
```

First, design decisions. My goal here was to make sure that each API/Request shows up as it's own operation within LightStep, but is also configurable to a degree. THat's where getName() plays it's part.

injectContext() is needed because we want our traces in our UI to be properly correlated with the traces in the services downstream. 

The intrecept() method itself is very simple, we check if we got a response and log that on our span, or we check if we received an error and log that on our span. The difference in our error case is that we set a Tag of error to true.

That's it! :)

# Extending Our Interceptor
Obivously this is just a code snippet and not a plugin, so you cna change this in any way that makes sense for you. With tracing, how you identify operations and tagging schemes is ultimately up to you. In my next version, I will add configuration to allow sets of tags for success and error states.






