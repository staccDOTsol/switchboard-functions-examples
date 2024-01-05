use crate::*;
use near_sdk::json_types::I128;
use rust_decimal::Decimal;
use std::cmp::Ordering;
use std::convert::TryInto;
use std::fmt;

#[derive(
    Default,
    Debug,
    Copy,
    Clone,
    Eq,
    PartialEq,
    BorshDeserialize,
    BorshSerialize,
    Serialize,
    Deserialize,
)]
pub struct SwitchboardDecimal {
    pub mantissa: i128,
    pub scale: u32,
}

impl fmt::Display for SwitchboardDecimal {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}
impl SwitchboardDecimal {
    pub fn new(mantissa: i128, scale: u32) -> SwitchboardDecimal {
        Self { mantissa, scale }
    }
    pub fn from_rust_decimal(d: Decimal) -> SwitchboardDecimal {
        Self::new(d.mantissa(), d.scale())
    }
}
impl TryInto<Decimal> for &SwitchboardDecimal {
    type Error = Error;
    fn try_into(self) -> Result<Decimal, Error> {
        Decimal::try_from_i128_with_scale(self.mantissa, self.scale)
            .map_err(|_| Error::DecimalConversionError)
    }
}
impl TryInto<Decimal> for SwitchboardDecimal {
    type Error = crate::Error;
    fn try_into(self) -> Result<Decimal, Error> {
        Decimal::try_from_i128_with_scale(self.mantissa, self.scale)
            .map_err(|_| Error::DecimalConversionError)
    }
}
impl Ord for SwitchboardDecimal {
    fn cmp(&self, other: &Self) -> Ordering {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s.cmp(&other)
    }
}
impl PartialOrd for SwitchboardDecimal {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s.partial_cmp(&other)
    }
    fn lt(&self, other: &Self) -> bool {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s < other
    }
    fn le(&self, other: &Self) -> bool {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s <= other
    }
    fn gt(&self, other: &Self) -> bool {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s > other
    }
    fn ge(&self, other: &Self) -> bool {
        let s: Decimal = self.try_into().unwrap();
        let other: Decimal = other.try_into().unwrap();
        s >= other
    }
}

#[derive(
    Debug, Copy, Clone, Eq, PartialEq, Serialize, Deserialize, BorshDeserialize, BorshSerialize,
)]
pub struct JsonDecimal {
    pub mantissa: I128,
    pub scale: u32,
}
impl TryInto<Decimal> for &JsonDecimal {
    type Error = Error;
    fn try_into(self) -> Result<Decimal, Error> {
        Decimal::try_from_i128_with_scale(self.mantissa.0, self.scale)
            .map_err(|_| Error::DecimalConversionError)
    }
}
impl TryInto<Decimal> for JsonDecimal {
    type Error = crate::Error;
    fn try_into(self) -> Result<Decimal, Error> {
        Decimal::try_from_i128_with_scale(self.mantissa.0, self.scale)
            .map_err(|_| Error::DecimalConversionError)
    }
}
impl Into<SwitchboardDecimal> for JsonDecimal {
    fn into(self) -> SwitchboardDecimal {
        SwitchboardDecimal {
            mantissa: self.mantissa.0,
            scale: self.scale,
        }
    }
}
