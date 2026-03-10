'use client';

import { EventEmitter } from 'events';

// This is a client-side event emitter.
// We are using the 'events' package shim provided by Next.js for browsers.
class ErrorEventEmitter extends EventEmitter {}

export const errorEmitter = new ErrorEventEmitter();
