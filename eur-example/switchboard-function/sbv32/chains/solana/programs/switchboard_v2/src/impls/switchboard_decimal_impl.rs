use crate::*;

impl SwitchboardDecimal {
    pub fn new(mantissa: i128, scale: u32) -> SwitchboardDecimal {
        Self { mantissa, scale }
    }
    pub fn from_rust_decimal(d: Decimal) -> SwitchboardDecimal {
        Self::new(d.mantissa(), d.scale())
    }
}
impl From<Decimal> for SwitchboardDecimal {
    fn from(val: Decimal) -> Self {
        SwitchboardDecimal::new(val.mantissa(), val.scale())
    }
}
impl TryInto<Decimal> for &SwitchboardDecimal {
    type Error = anchor_lang::error::Error;
    fn try_into(self) -> Result<Decimal> {
        Decimal::try_from_i128_with_scale(self.mantissa, self.scale)
            .map_err(|_| error!(SwitchboardError::DecimalConversionError))
    }
}
impl TryInto<Decimal> for SwitchboardDecimal {
    type Error = anchor_lang::error::Error;
    fn try_into(self) -> Result<Decimal> {
        Decimal::try_from_i128_with_scale(self.mantissa, self.scale)
            .map_err(|_| error!(SwitchboardError::DecimalConversionError))
    }
}
impl From<SwitchboardDecimal> for BorshDecimal {
    fn from(s: SwitchboardDecimal) -> Self {
        Self {
            mantissa: s.mantissa,
            scale: s.scale,
        }
    }
}
impl From<BorshDecimal> for SwitchboardDecimal {
    fn from(val: BorshDecimal) -> Self {
        SwitchboardDecimal {
            mantissa: val.mantissa,
            scale: val.scale,
        }
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
