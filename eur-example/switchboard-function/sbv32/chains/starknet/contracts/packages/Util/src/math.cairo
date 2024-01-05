use core::integer::{U64Mul, U64Sub};

trait IntegerExt<T> {
    /// Returns the absolute difference between `self` and `other`.
    fn abs_diff(self: @T, other: T) -> T;
    /// Returns the value of self ^ exponent.
    fn exp(self: @T, exponent: T) -> T;
}

impl U64IntegerExt of IntegerExt<u64> {
    fn abs_diff(self: @u64, other: u64) -> u64 {
        if *self > other {
            U64Sub::sub(*self, other)
        } else {
            U64Sub::sub(other, *self)
        }
    }
    fn exp(self: @u64, exponent: u64) -> u64 {
        match exponent.into() {
            0 => 1,
            _ => U64Mul::mul(*self, U64IntegerExt::exp(self, exponent - 1))
        }
    }
}

