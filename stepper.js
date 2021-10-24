import { range, sleep } from "./helpers.js";
import Switch from "./switch.js";

export default class Stepper {
  constructor(pins, switchPin) {
    this.gpioSet = pins;
    this.switch = new Switch(switchPin);
  }

  steps = 512;
  partSteps = 512 * 8;
  sequence = [
    [1, 0, 0, 1],
    [1, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 1]
  ].reverse();
  currentStep = 0;
  currentPartStep = 0;
  seqIdx = 0;
  delay = 0.05;

  async setOutputs(outputs) {
    for (const pin in this.gpioSet) {
      await this.gpioSet[pin].write(outputs[pin]);
    }
  }

  changePartStepBy(num) {
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

  async forwardFull(steps) {
    if (steps < 0) {
      return await this.backwardFull(-steps);
    }
    for (const step in range(steps)) {
      await this.forwardPart(this.sequence.length);
    }
  }

  async forwardPart(steps) {
    if (steps < 0) {
      return await this.backwardPart(-steps);
    }

    for (const step in range(steps)) {
      this.changePartStepBy(1);
      await this.setOutputs(this.sequence[this.seqIdx]);
      await sleep(this.delay);
    }
  }

  async backwardFull(steps) {
    if (steps < 0) {
      return await this.forwardFull(-steps);
    }
    for (const step in range(steps)) {
      await this.backwardPart(this.sequence.length);
    }
  }

  async backwardPart(steps) {
    if (steps < 0) {
      return await this.forwardPart(-steps);
    }

    for (const step in range(steps)) {
      this.changePartStepBy(-1);
      await this.setOutputs(this.sequence[this.seqIdx]);
      await sleep(this.delay);
    }
  }

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
    this.gpioSet = [];
  }

  async init() {
    await this.switch.check();
    await this.switch.check(); // Strange, input sometimes reads on when actually off when first read
    while (!this.switch.pressed) {
      await this.backwardPart(1);
      await this.switch.check();
    }

    this.currentPartStep = 0;
    this.currentStep = 0;
  }
}
