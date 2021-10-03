import EventEmitter from "events";
import { Gpio } from "onoff";

export default class Switch /* extends EventEmitter*/ {
  pressed = false;
  constructor(pinIn) {
    //super();
    this.pin = new Gpio(pinIn, "in");
    this.pressed = !!this.pin.readSync();
  }

  check() {
    return (this.pressed = !!this.pin.readSync());
  }
}
