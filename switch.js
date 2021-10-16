import EventEmitter from "events";

export default class Switch {
  pressed = false;
  constructor(pinIn) {
    this.pin = pinIn;
  }

  async check() {
    return (this.pressed = !!(await this.pin.read()));
  }
}
