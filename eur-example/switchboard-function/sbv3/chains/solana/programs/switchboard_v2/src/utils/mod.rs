// pub mod voter_stake_registry;
// pub use voter_stake_registry::*;

pub fn calc_priority_fee(
    timestamp: i64,
    last_update_timestamp: i64,
    base_priority_fee: u32,
    priority_fee_bump: u32,
    priority_fee_bump_period: u32,
    max_priority_fee_multiplier: u32,
) -> u64 {
    if priority_fee_bump_period == 0 {
        return base_priority_fee.into();
    }
    if max_priority_fee_multiplier == 0 {
        return base_priority_fee.into();
    }

    let staleness = (timestamp as u64).saturating_sub(last_update_timestamp as u64);
    if staleness == 0 {
        return base_priority_fee.into();
    }

    let multiplier = std::cmp::min(
        staleness
            .checked_div(priority_fee_bump_period as u64)
            .unwrap_or(u64::MAX)
            .saturating_sub(1),
        max_priority_fee_multiplier.into(),
    );

    u64::from(priority_fee_bump)
        .saturating_mul(multiplier)
        .saturating_add(base_priority_fee.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_priority_config() {
        let fee = calc_priority_fee(i64::MAX, 0, 0, 0, 0, 0);

        assert_eq!(fee, 0);
    }

    #[test]
    fn test_empty_max_multiplier() {
        let fee = calc_priority_fee(10_500, 10_000, 100, 10, 60, 0);

        assert_eq!(fee, 100);
    }

    #[test]
    fn test_empty_bump_period() {
        let fee = calc_priority_fee(10_500, 10_000, 100, 10, 0, 10);

        assert_eq!(fee, 100);
    }

    #[test]
    fn test_not_stale() {
        let fee = calc_priority_fee(10_500, 10_500, 100, 10, 60, 10);

        assert_eq!(fee, 100);
    }

    #[test]
    fn test_barely_stale() {
        let fee = calc_priority_fee(10_510, 10_500, 100, 10, 60, 10);

        assert_eq!(fee, 100);
    }

    #[test]
    fn test_stale_for_1_period() {
        let fee = calc_priority_fee(10_621, 10_500, 100, 10, 60, 10);

        assert_eq!(fee, 110);
    }

    #[test]
    fn test_stale_for_5_periods() {
        let fee = calc_priority_fee(10_861, 10_500, 100, 10, 60, 10);

        assert_eq!(fee, 150);
    }

    #[test]
    fn test_max_multiplier() {
        let fee = calc_priority_fee(10_500, 0, 100, 10, 60, 10);

        assert_eq!(fee, 200);
    }
}
