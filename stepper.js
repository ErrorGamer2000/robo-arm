import { range, sleep } from "./utils.js";
import Switch from "./switch.js";

/* -------------------------------------------------------------------------- */
/*                       Stepper Motor Management Class                       */
/* -------------------------------------------------------------------------- */
export default class Stepper {
  /* --- Create a new stepper motor controller using four outpus and 1 input -- */
  constructor(pins, switchPin) {
    this.gpioSet = pins;
    this.switch = new Switch(switchPin);
  }

  /**
   * Total number of steps in a revolution (Approximate, gear ratio is not exact)
   * Close enough because the motor should never go through more than one revolution.
   */
  steps = 512;

  /* The number of partial steps in each full turn of the motor */
  partSteps = 512 * 8;

  /**
   * Output sequence needed to turn the motor.
   * Reversed from what is normal because motors appear to have directions switched.
   */
  sequence = [
    [0, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 0],
    [0, 1, 1, 0],
    [0, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 0],
    [1, 0, 0, 1]
  ].reverse();

  /* Position variables */
  currentStep = 0;
  currentPartStep = 0;
  seqIdx = 0;

  /* Time to wait between each partial step. Can be changed. */
  delay = 0.005;

  /* Max step motor can turn to */
  max = Infinity;

  /* Min step motor can turn to */
  min = 0;

  /* ------------------- Set the output values from an array ------------------ */
  async setOutputs(outputs) {
    for (const pin in this.gpioSet) {
      await this.gpioSet[pin].write(outputs[pin]); //Turn pin on or off
    }
  }

  /* ----------------- Move the partial step either up or down ---------------- */
  changePartStepBy(num) {
    //Purely for data storage reasons
    if (this.currentPartStep + num > this.max) {
      //Cannot go further
      return;
    }
    if (this.currentPartStep + num < this.min) {
      //Cannot go further
      return;
    }

    /* ---------------------------- Update all values --------------------------- */
    this.currentPartStep += num;
    this.currentStep =
      (this.currentPartStep - (this.currentPartStep % this.sequence.length)) /
      this.sequence.length;
    this.seqIdx += num;

    if (this.seqIdx < 0) {
      this.seqIdx = this.sequence.length + num;
    }

    if (this.seqIdx === this.sequence.length) {
      this.seqIdx = 0;
    }
  }

  /* ------------------------- Move so many full steps ------------------------ */
  async forwardFull(steps) {
    if (steps < 0) {
      return await this.backwardFull(-steps); //Should not move a negative amount
    }
    for (const step in range(steps)) {
      await this.forwardPart(this.sequence.length); //Move
    }
  }

  async backwardFull(steps) {
    if (steps < 0) {
      return await this.forwardFull(-steps); //Should not move a negative amount
    }
    for (const step in range(steps)) {
      await this.backwardPart(this.sequence.length); //Move
    }
  }

  /* ----------------------- Move so many partial steps ----------------------- */
  async forwardPart(steps) {
    if (steps < 0) {
      return await this.backwardPart(-steps); //Should not move a negative amount
    }

    for (const step in range(steps)) {
      this.changePartStepBy(1);
      await this.setOutputs(this.sequence[this.seqIdx]); //Set pin values
      await sleep(this.delay); //Delay next frame
    }
  }

  async backwardPart(steps) {
    if (steps < 0) {
      return await this.forwardPart(-steps); //Should not move a negative amount
    }

    for (const step in range(steps)) {
      this.changePartStepBy(-1);
      await this.setOutputs(this.sequence[this.seqIdx]); //Set pin values
      await sleep(this.delay);
    }
  }

  /* ------------------ Reset the motor and clear gpio values ----------------- */
  async cleanup() {
    if (this.currentPartStep > this.partSteps / 2) {
      this.backwardPart(1);
    }
    await this.init();

    await Promise.all(
      this.gpioSet.map(function (gpio) {
        return gpio.write(0);
      })
    );
  }

  /* ------------- Calibrate the motor and prepare for the program ------------ */
  /* --------- Used to prevent issues if the program was stopped early -------- */
  async init() {
    let min = this.min;
    this.min = -Infinity;
    await this.switch.check();
    while (!this.switch.pressed) {
      await this.backwardPart(1);
      await this.switch.check();
    }

    this.currentPartStep = 0;
    this.currentStep = 0;
    this.min = min;
  }
}
