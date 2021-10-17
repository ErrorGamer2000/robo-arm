import Stepper from "./stepper.js";
import { wait } from "./helpers.js";
import Bus from "./microchip/bus.js";

const bus1 = new Bus(1, 0x20);
await bus1.open();
bus1.setPinIO("a", 4, Bus.IN);
await bus1.configureIO();
const bus1pins = {
  a: [
    bus1.getPin("a", 0),
    bus1.getPin("a", 1),
    bus1.getPin("a", 2),
    bus1.getPin("a", 3),
    bus1.getPin("a", 4),
    bus1.getPin("a", 5),
    bus1.getPin("a", 6),
    bus1.getPin("a", 7)
  ],
  b: [
    bus1.getPin("b", 0),
    bus1.getPin("b", 1),
    bus1.getPin("b", 2),
    bus1.getPin("b", 3),
    bus1.getPin("b", 4),
    bus1.getPin("b", 5),
    bus1.getPin("b", 6),
    bus1.getPin("b", 7)
  ]
};

const stepper1 = new Stepper([...bus1pins.a.slice(0, 4)], bus1pins.a[4]);

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
