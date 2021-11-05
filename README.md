# Code

```js
import i2c from "i2c-bus";
import { copy, invariant, isOne, range } from "./utils.js";

/* -------------------------------------------------------------------------- */
/*                 Contants For Interfacing With The Microchip                */
/* -------------------------------------------------------------------------- */

class Constants {
  static DEVICE = 0x20; // Default device address
  static IODIRA = 0x00; // Set the direction (inout/output) of row A [Command]
  static IODIRB = 0x01; // Set the direction (inout/output) of row B [Command]
  static OLATA = 0x14; // Set output values of the pins on row A [Command]
  static OLATB = 0x15; // Set output values of the pins on row B [Command]
  static GPIOB = 0x13; // Read input values of the pins on row A [Command]
  static GPIOA = 0x12; // Read input values of the pins on row B [Command]
  static IN = 1;
  static OUT = 0;
}

Object.freeze(Constants); // Prevent accidental changes

/* -------------------------------------------------------------------------- */
/*                               Main Bus Class                               */
/* -------------------------------------------------------------------------- */

export default class Bus extends Constants {
  /* Keep track of input/output states of pins */
  __pinIO = [
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]), //1 = in, 0 = out
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])
  ];
  /* Pin value storage */
  __pinValues = [
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])
  ];
  /* Whether or not the pins have been registerd as inputs or outputs yet */
  hasSetIO = false;
  constructor(busnum, addr = Bus.DEVICE, { force = false } = {}) {
    /* Required because the `Bus` class is a child of `Constants` */
    /* Doesn't do anything */
    super();

    /* Store data */
    this.__data = {
      num: busnum,
      force,
      addr
    };

    this.__device = null;
  }

  /* --------------------- Create a connection wit the bus -------------------- */
  async open() {
    return (this.__device = await i2c.openPromisified(this.__data.num, {
      forceAccess: this.__data.force
    }));
  }

  /* -------------------- Close the connection with the bus ------------------- */
  close() {
    return this.__device.close();
  }

  /* ------------------ Set a specific pin as an input/putput ----------------- */
  setPinIO(row, num, inout) {
    /* -------------------------------- Failsafes ------------------------------- */
    invariant(
      isOne(row, [0, "a", 1, "b"]),
      new Error("Invalid parameter: row")
    );
    invariant(
      isOne(num, [0, 1, 2, 3, 4, 5, 6, 7]),
      new Error("Invalid parameter: num")
    );
    invariant(
      isOne(inout, [0, false, 1, true]),
      new Error("Invalid parameter: inout")
    );

    /* Convert to 0 or 1 */
    if (typeof row === "string") {
      row = ["a", "b"].indexOf(row);
    }

    /* ---------------------------- Actual set method --------------------------- */
    this.__pinIO[row][num] = Number(inout);
  }

  async configureIO() {
    /* ------------------ Convert input/output arrays to binary ----------------- */

    let rowA = this.getModes(0);
    let rowB = this.getModes(1);

    /* ------------------------- Send data to microchip ------------------------- */

    await this.__device.writeByte(this.__data.addr, Bus.IODIRA, rowA);
    await this.__device.writeByte(this.__data.addr, Bus.IODIRB, rowB);
  }

  /* -------- Convert binary input/output data to a number for commands ------- */
  getModes(row) {
    console.log(
      `Loading row ${row} config as ${
        "0".repeat(8 - copy(this.__pinIO[row]).reverse().join("").length) +
        copy(this.__pinIO[row]).reverse().join("")
      }`
    );
    return parseInt(copy(this.__pinIO[row]).reverse().join(""), 2);
  }

  /* ------------------- Get a GPIO pin for reading/writing ------------------- */
  getPin(row, pin) {
    /* -------------------------------- Failsafes ------------------------------- */
    invariant(isOne(pin, range(0, 8)), new Error("Invalid parameter: pin"));
    invariant(
      isOne(row, [0, "a", 1, "b"]),
      new Error("Invalid parameter: row")
    );
    /* Convert to 0 or 1 */
    if (typeof row === "string") {
      row = ["a", "b"].indexOf(row);
    }

    /* --------------------------- GPIO Handler Class --------------------------- */
    const self = this;
    class Gpio {
      static HIGH = 1;
      static LOW = 0;
      constructor(pin, row) {
        this.__pin = pin;
        this.__row = row;
        /* Whether or not the pin is configured as an input */
        this.isInput = self.__pinIO[row][pin] === 1;
      }

      async write(value) {
        /* -------------------------------- Failsafes ------------------------------- */
        invariant(
          !this.isInput,
          new TypeError("Pin is not configured as an output.")
        );
        invariant(
          isOne((value = Number(value)), [0, 1]),
          new TypeError("Pin is not configured as an output.")
        );

        /* -------------------------- Set value and update -------------------------- */
        self.__pinValues[this.__row][this.__pin] = value;

        await self.updateRow(this.__row);
      }

      async read() {
        invariant(
          this.isInput,
          new TypeError("Pin is not configured as an input.")
        );

        await self.readRow(this.__row);

        return self.__pinValues[this.__row][this.__pin];
      }
    }

    return new Gpio(pin, row);
  }

  /* ---------------- Update the on/off of outputs on a pin row --------------- */
  async updateRow(row) {
    await this.__device.writeByte(
      this.__data.addr,
      row /* true if 1 */ ? Bus.OLATB : Bus.OLATA,
      this.getValues(row)
    );
  }

  /* --------- Get the command number to set the outputs of a pin set --------- */
  getValues(row) {
    return parseInt(copy(this.__pinValues[row]).reverse().join(""), 2);
  }

  /* ----------------------- Check values for input pins ---------------------- */
  async readRow(row) {
    /* Get data byte(number from 0 to 255) */
    let byte = await this.__device.readByte(
      this.__data.addr,
      row /* true if 1 */ ? Bus.GPIOB : Bus.GPIOA
    );

    /* Convert byte to binary for reading */
    let binary = this.toBinaryArray(byte);

    let rowIO = this.__pinIO[row];
    let rowValues = this.__pinValues[row];

    /* Update pin values */
    let values = Buffer.from(
      rowIO.map(function (inOut, pin) {
        if (inOut === 1) {
          return binary[pin] === 1 ? 1 : 0; //Account for pull-up
        }

        return rowValues[pin];
      })
    );

    this.__pinValues[row] = values;
  }

  /* ------ Convert a microchip response to binary from a base 10 number ------ */
  toBinaryArray(byte) {
    let binaryArray = Buffer.from(byte.toString(2).split(""));

    return binaryArray;
  }
}
```

```js
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

  /* The number of partial steps in each full step of the motor */
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
  ];

  /* Position variables */
  currentStep = 0;
  currentPartStep = 0;
  seqIdx = 0;

  /* Time to wait between each partial step. Can be changed. */
  delay = 0.05;

  /* ------------------- Set the output values from an array ------------------ */
  async setOutputs(outputs) {
    for (const pin in this.gpioSet) {
      await this.gpioSet[pin].write(outputs[pin]);
    }
  }

  /* ----------------- Move the partial step either up or down ---------------- */
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

  /* ------------------------- Move so many full steps ------------------------ */
  async forwardFull(steps) {
    if (steps < 0) {
      return await this.backwardFull(-steps);
    }
    for (const step in range(steps)) {
      await this.forwardPart(this.sequence.length);
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

  /* ----------------------- Move so many partial steps ----------------------- */
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
    this.gpioSet = [];
  }

  /* ------------- Calibrate the motor and prepare for the program ------------ */
  /* --------- Used to prevent issues if the program was stopped early -------- */
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
```
