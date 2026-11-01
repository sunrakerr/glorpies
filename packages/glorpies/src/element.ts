import { defineGlorpie } from './element-core';

export { GlorpieElement, defineGlorpie } from './element-core';

// Keep registration in this entry: shared chunks may be dropped by a consumer's bundler.
defineGlorpie();
