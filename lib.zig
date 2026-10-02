const std = @import("std");
const builtin = @import("builtin");

export fn add(a: c_int, b: c_int) c_int {
    return a + b;
}

export fn multiply(a: f64, b: f64) f64 {
    return a * b;
}

export fn sum_array(ptr: [*]const f64, len: usize) f64 {
    var total: f64 = 0;
    for (ptr[0..len]) |v| {
        total += v;
    }
    return total;
}

export fn num_fib(n: c_uint) u32 {
    var a: u32 = 0;
    var b: u32 = 1;
    var i: c_uint = 0;
    while (i < n) : (i += 1) {
        const tmp = a + b;
        a = b;
        b = tmp;
    }
    return a;
}
