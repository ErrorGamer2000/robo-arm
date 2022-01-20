/* -------------------------------------------------------------------------- */
/*                          Import required libraries                         */
/* -------------------------------------------------------------------------- */

/* ------------------------------- Local Files ------------------------------ */
import Stepper from "./stepper.js";
import process from "process";
import Chip from "./chip.js";

/* ---------------------------- Installed Modules --------------------------- */
import { Gpio } from "onoff";
import { spawn } from "child_process";

/* -------------------------------------------------------------------------- */
/*                                    Setup                                   */
/* -------------------------------------------------------------------------- */

let led = new Gpio(16, "out"); //Status LED
let button = {};
button.red = new Gpio(20, "in", "both"); //Red(next) button
button.black = new Gpio(21, "in", "rising"); //Black(power) button

led.writeSync(1); //Turn status LED on

process.on("SIGINT", (_) => {
  //Failsafe
  led.writeSync(0);
  led.unexport();
  process.exit();
});

/**
 * @type {number[][]}
 */
let chipConfig = [
  //Configuration matrix for pin directions
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
  //Create chip references
  new Chip(1, 0x20),
  new Chip(1, 0x21),
  new Chip(1, 0x22),
  new Chip(1, 0x23)
];

for (const chip in chips) {
  await chips[chip].open(); // Connect to the chip
  chipConfig[chip].forEach(function (dir, idx) {
    //Set pin directions
    chips[chip].setPinIO("a", idx, dir);
  });

  await chips[chip].configureIO(); //Load pin direction configuration
}

button.black.watch(async function () {
  //Watch off button, and shut down when pressed
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
  //Get pins from chips
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
  //Load stepper motor controllers
  new Stepper([...pins[0].slice(0, 4)], pins[0][4]),
  new Stepper([...pins[0].slice(5), pins[1][0]], pins[1][1]),
  new Stepper([...pins[1].slice(2, 6)], pins[1][6]),
  new Stepper([pins[1][7], ...pins[2].slice(0, 3)], pins[2][3]),
  new Stepper([...pins[2].slice(4)], pins[3][5])
];

const hand = {
  //Index for easy reference
  thumb: steppers[0],
  index: steppers[1],
  middle: steppers[2],
  ring: steppers[3],
  pinky: steppers[4]
};

for (let stepper of steppers) {
  stepper.max = 1400; //Set max motor turn position
}

/* -------------------------------------------------------------------------- */
/*                                     Run                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------- Functions ------------------------------- */

async function calibrate() {
  //Reset all motors to resting position
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
function setPosition(stepper, percent) {
  //Set motor position as a percentage of maximum position
  return stepper.forwardPart(
    stepper.max * (Math.round(percent) / 100) - stepper.currentPartStep
  );
}

/* ------------------------------- Aesthetics ------------------------------- */
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
    await Promise.all([
      setPosition(hand.thumb, 0),
      setPosition(hand.middle, 0),
      setPosition(hand.ring, 0)
    ]);
  },
  async function () {
    await Promise.all([
      setPosition(hand.index, 100),
      setPosition(hand.middle, 100),
      setPosition(hand.ring, 100),
      setPosition(hand.pinky, 100)
    ]);
    await Promise.all([
      setPosition(hand.index, 0),
      setPosition(hand.middle, 0),
      setPosition(hand.ring, 0),
      setPosition(hand.pinky, 0)
    ]);
  },
  async function () {
    await Promise.all([
      setPosition(hand.middle, 100),
      setPosition(hand.ring, 100),
      setPosition(hand.pinky, 100)
    ]);
    await Promise.all([
      setPosition(hand.middle, 0),
      setPosition(hand.ring, 0),
      setPosition(hand.pinky, 0)
    ]);
  }
];

/* -------------------------------- Main Loop ------------------------------- */
/* Start */
setThink(true);
await calibrate();
setThink(false);

/* Loop */
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
    await seq(); //Run sequence
    await calibrate(); //Reset motors to resting position
    setThink(false);
  }
}
