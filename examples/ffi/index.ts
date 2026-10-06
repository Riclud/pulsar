import { dlopen } from "bun:ffi";

const lib = dlopen(`${import.meta.dir}/libhello.so`, {
  add: { args: ["i32", "i32"], returns: "i32" },
  multiply: { args: ["f64", "f64"], returns: "f64" },
  sum_array: { args: ["ptr", "usize"], returns: "f64" },
  num_fib: { args: ["u32"], returns: "u32" },
});

console.log("add(2, 3)      =", lib.symbols.add(2, 3));
console.log("multiply(1.5, 2)=", lib.symbols.multiply(1.5, 2));
console.log("sum_array(...) =", lib.symbols.sum_array(new Float64Array([1, 2, 3, 4, 5]), 5));
console.log("num_fib(10)    =", lib.symbols.num_fib(10));