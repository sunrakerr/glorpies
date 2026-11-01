import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import 'glorpies/element';

export async function start(stage, options, error) {
  const host = document.createElement('lab-angular'); stage.append(host);
  class Case { props = signal(options); failed(event) { event.preventDefault(); error(event.detail); } }
  Component({
    selector: 'lab-angular', standalone: true, schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `<glorpie-face [name]="props().name" [look]="props().look" [size]="props().size" [state]="props().state" [shape]="props().shape" [background]="props().background" [alive]="props().alive" [pokeable]="props().pokeable" [label]="props().label" [priority]="props().priority" [class]="props().className || ''" (glorpie-error)="failed($event)"></glorpie-face>`,
  })(Case);
  const app = await bootstrapApplication(Case, { providers: [provideZonelessChangeDetection()] });
  return { update(next) { app.components[0].instance.props.set(next); app.tick(); }, destroy: () => app.destroy() };
}
