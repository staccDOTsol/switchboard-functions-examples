use sb_util::math::U64IntegerExt;

#[test]
#[available_gas(2000000)]
fn u64_abs_diff() {
    assert(64_u64.abs_diff(5) == 59, 'U64AbsDiff-0');
    assert(2_u64.abs_diff(15) == 13, 'U64AbsDiff-1');
    assert(53_u64.abs_diff(53) == 0, 'U64AbsDiff-2');
    assert(53_u64.abs_diff(0) == 53, 'U64AbsDiff-3');
}

#[test]
#[available_gas(2000000)]
fn u64_exp() {
    assert(2_u64.exp(0) == 1, 'U64Exp-0');
    assert(2_u64.exp(1) == 2, 'U64Exp-1');
    assert(2_u64.exp(2) == 4, 'U64Exp-2');
    assert(2_u64.exp(3) == 8, 'U64Exp-3');
}
