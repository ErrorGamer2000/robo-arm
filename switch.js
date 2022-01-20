/* -------------------------------------------------------------------------- */
/*            A simple class to manage switches and switch reading            */
/* -------------------------------------------------------------------------- */

export default class Switch {
  pressed = false;
  constructor(pinIn) {
    this.pin = pinIn;
  }

  async check() {
    return (this.pressed = !!(await this.pin.read())); //Read whether switch has input or not
  }
}
