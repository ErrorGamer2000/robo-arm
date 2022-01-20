import Stepper from "./stepper.js";
import process from "process";
import { createInterface } from "readline";
import { sleep } from "./utils.js";
import Chip from "./chip.js";

import { Gpio } from "onoff";
import { spawn } from "child_process";

/* -------------------------------------------------------------------------- */
/*                                    Setup                                   */
/* -------------------------------------------------------------------------- */

let led = new Gpio(16, "out");
let button = {};
button.red = new Gpio(20, "in", "both");
button.black = new Gpio(21, "in", "rising");

led.writeSync(1);

process.on("SIGINT", (_) => {
  led.writeSync(0);
  led.unexport();
  process.exit();
});

/**
 * @type {number[][]}
 */
let chipConfig = [
  Array(8).fill(Chip.OUT),
  Array(8).fill(Chip.OUT),
  Array(8).fill(Chip.OUT),
  Array(8).fill(Chip.OUT)
];

/* ---------------------------- Set up input pins --------------------------- */

chipConfig[0][4] = Chip.IN;
chipConfig[1][1] = Chip.IN;
chipConfig[1][6] = Chip.IN;
chipConfig[2][3] = Chip.IN;
chipConfig[3][5] = Chip.IN;

/* ------------------------------ Set up chips ------------------------------ */

const chips = [
  new Chip(1, 0x20),
  new Chip(1, 0x21),
  new Chip(1, 0x22),
  new Chip(1, 0x23)
];

for (const chip in chips) {
  await chips[chip].open();
  chipConfig[chip].forEach(function (dir, idx) {
    chips[chip].setPinIO("a", idx, dir);
  });

  await chips[chip].configureIO();
}

button.black.watch(async function () {
  led.writeSync(0);
  led.unexport();
  button.red.unexport();
  button.black.unexport();
  await Promise.all(
    chips.map(function (chip) {
      return chip.__device.close();
    })
  );
  spawn("sudo", ["shutdown", "-h", "now"]);
});

const pins = (function () {
  let temp = [];
  for (const chip in chips) {
    temp.push(
      chipConfig[chip].map(function (_, idx) {
        return chips[chip].getPin("a", idx);
      })
    );
  }

  return temp;
})();

/* ------------------------------ Set up motors ----------------------------- */

const steppers = [
  new Stepper([...pins[0].slice(0, 4)], pins[0][4]),
  new Stepper([...pins[0].slice(5), pins[1][0]], pins[1][1]),
  new Stepper([...pins[1].slice(2, 6)], pins[1][6]),
  new Stepper([pins[1][7], ...pins[2].slice(0, 3)], pins[2][3]),
  new Stepper([...pins[2].slice(4)], pins[3][5])
];

const hand = {
  thumb: steppers[0],
  index: steppers[1],
  middle: steppers[2],
  ring: steppers[3],
  pinky: steppers[4]
};

for (let stepper of steppers) {
  stepper.max = 1400;
}

/* -------------------------------------------------------------------------- */
/*                                     Run                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------- Functions ------------------------------- */

async function calibrate() {
  return Promise.all(
    steppers.map(function (stepper) {
      return stepper.init();
    })
  );
}

/**
 *
 * @param {Stepper} stepper
 * @param {number} percent
 */
function move(stepper, percent) {
  return stepper.forwardPart(stepper.max * (Math.round(percent) / 100));
}

/**
 *
 * @param {Stepper} stepper
 * @param {number} percent
 */
function setPosition(stepper, percent) {
  return stepper.forwardPart(
    stepper.max * (Math.round(percent) / 100) - stepper.currentPartStep
  );
}

let thinking = null;
let off = false;
function setThink(think) {
  if (think) {
    try {
      clearInterval(thinking);
    } finally {
      led.writeSync(0);
      thinking = setInterval(function () {
        off = !off;
        led.writeSync(Number(off));
      }, 250);
    }
  } else {
    try {
      clearInterval(thinking);
    } finally {
      off = false;
      thinking = null;
      led.writeSync(1);
    }
  }
}

/* -------------------------------- Sequences ------------------------------- */

const sequences = [
  async function () {
    await Promise.all(
      steppers.map(function (stepper) {
        return setPosition(stepper, 100);
      })
    );
  },
  async function () {
    await setPosition(hand.thumb, 100);
    await setPosition(hand.thumb, 0);
  },
  async function () {
    await Promise.all([
      setPosition(hand.thumb, 100),
      setPosition(hand.middle, 100),
      setPosition(hand.ring, 100)
    ]);
  },
  async function () {
    await Promise.all([
      setPosition(hand.index, 100),
      setPosition(hand.middle, 100),
      setPosition(hand.ring, 100),
      setPosition(hand.pinky, 100)
    ]);
  },
  async function () {
    await Promise.all([
      setPosition(hand.middle, 100),
      setPosition(hand.ring, 100),
      setPosition(hand.pinky, 100)
    ]);
  }
];

/* -------------------------------- Main Loop ------------------------------- */
setThink(true);
await calibrate();
setThink(false);
while (true) {
  for (let seq of sequences) {
    await new Promise(function (resolve, reject) {
      //Wait for red button to be pressed
      function onInterrupt(e, v) {
        if (e) return reject(e);
        if (v) {
          button.red.unwatch(onInterrupt);
          resolve();
        }
      }

      button.red.watch(onInterrupt);
    });
    setThink(true);
    await seq();
    await calibrate();
    setThink(false);
  }
}
