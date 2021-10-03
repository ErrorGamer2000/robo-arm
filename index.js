import { Gpio } from "onoff";
import Stepper from "./stepper.js";
import { wait } from "./helpers.js";

const stepper1 = new Stepper([4, 17, 23, 24], 25);

async function main() {
  console.log("Initialize...");
  await stepper1.init();
  await wait(1000);
  console.log("Forwards...");
  await stepper1.forwardFull(400);
  await wait(1000);
  console.log("Backwards...");
  await stepper1.backwardFull(300);
  await wait(1000);
  console.log("Cleanup...");
  await stepper1.cleanup();
}

main();
