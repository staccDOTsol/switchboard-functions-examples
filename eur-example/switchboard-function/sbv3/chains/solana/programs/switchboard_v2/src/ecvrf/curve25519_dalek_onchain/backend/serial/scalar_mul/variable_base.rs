#![allow(non_snake_case)]

use crate::ecvrf::curve25519_dalek_onchain::backend::serial::curve_models::ProjectiveNielsPoint;
use crate::ecvrf::curve25519_dalek_onchain::traits::Identity;
use crate::ecvrf::curve25519_dalek_onchain::window::LookupTable;
use crate::EdwardsPoint;
use crate::Scalar;
// use solana_program::log::sol_log_compute_units;
use crate::CompletedPoint;
use crate::ProjectivePoint;

// /// Perform constant-time, variable-base scalar multiplication.
// pub(crate) fn mul(point: &EdwardsPoint, scalar: &Scalar) -> EdwardsPoint {
// msg!("blah1");
// // Construct a lookup table of [P,2P,3P,4P,5P,6P,7P,8P]
// let lookup_table = LookupTable::<ProjectiveNielsPoint>::from(point);
// msg!("blah1");
// // Setting s = scalar, compute
// //
// //    s = s_0 + s_1*16^1 + ... + s_63*16^63,
// //
// // with `-8 ≤ s_i < 8` for `0 ≤ i < 63` and `-8 ≤ s_63 ≤ 8`.
// let scalar_digits = scalar.to_radix_16();
// msg!("blah1");
// // Compute s*P as
// //
// //    s*P = P*(s_0 +   s_1*16^1 +   s_2*16^2 + ... +   s_63*16^63)
// //    s*P =  P*s_0 + P*s_1*16^1 + P*s_2*16^2 + ... + P*s_63*16^63
// //    s*P = P*s_0 + 16*(P*s_1 + 16*(P*s_2 + 16*( ... + P*s_63)...))
// //
// // We sum right-to-left.
//
// // Unwrap first loop iteration to save computing 16*identity
// let mut tmp2;
// let mut tmp3 = EdwardsPoint::identity();
// let mut tmp1 = &tmp3 + &lookup_table.select(scalar_digits[63]);
// // Now tmp1 = s_63*P in P1xP1 coords
// let i = 63;
// //TODO(mgild): checkpoint here
// for i in (0..63).rev() {
// msg!("!!!");
// sol_log_compute_units();
// tmp2 = tmp1.to_projective(); // tmp2 =    (prev) in P2 coords
// tmp1 = tmp2.double();        // tmp1 =  2*(prev) in P1xP1 coords
// tmp2 = tmp1.to_projective(); // tmp2 =  2*(prev) in P2 coords
// tmp1 = tmp2.double();        // tmp1 =  4*(prev) in P1xP1 coords
// tmp2 = tmp1.to_projective(); // tmp2 =  4*(prev) in P2 coords
// tmp1 = tmp2.double();        // tmp1 =  8*(prev) in P1xP1 coords
// tmp2 = tmp1.to_projective(); // tmp2 =  8*(prev) in P2 coords
// tmp1 = tmp2.double();        // tmp1 = 16*(prev) in P1xP1 coords
// tmp3 = tmp1.to_extended();   // tmp3 = 16*(prev) in P3 coords
// tmp1 = &tmp3 + &lookup_table.select(scalar_digits[i]);
// // Now tmp1 = s_i*P + 16*(prev) in P1xP1 coords
// }
// tmp1.to_extended()
// }

/// Perform constant-time, variable-base scalar multiplication.
pub(crate) fn mul(
    round: usize,
    mut tmp1: CompletedPoint,
    point: &EdwardsPoint,
    scalar: &Scalar,
) -> (CompletedPoint, ProjectivePoint, EdwardsPoint) {
    // Construct a lookup table of [P,2P,3P,4P,5P,6P,7P,8P]
    let lookup_table = LookupTable::<ProjectiveNielsPoint>::from(point);
    // Setting s = scalar, compute
    //
    //    s = s_0 + s_1*16^1 + ... + s_63*16^63,
    //
    // with `-8 ≤ s_i < 8` for `0 ≤ i < 63` and `-8 ≤ s_63 ≤ 8`.
    let scalar_digits = scalar.to_radix_16();
    // Compute s*P as
    //
    //    s*P = P*(s_0 +   s_1*16^1 +   s_2*16^2 + ... +   s_63*16^63)
    //    s*P =  P*s_0 + P*s_1*16^1 + P*s_2*16^2 + ... + P*s_63*16^63
    //    s*P = P*s_0 + 16*(P*s_1 + 16*(P*s_2 + 16*( ... + P*s_63)...))
    //
    // We sum right-to-left.

    // Unwrap first loop iteration to save computing 16*identity
    if round == 63 {
        let tmp2 = ProjectivePoint::default();
        let tmp3 = EdwardsPoint::identity();
        tmp1 = &tmp3 + &lookup_table.select(scalar_digits[63]);
        return (tmp1, tmp2, tmp3);
    }
    // let mut tmp1: CompletedPoint = tmp1;
    // let mut tmp2: ProjectivePoint = tmp2;
    // let mut tmp3: EdwardsPoint = tmp3;
    let mut tmp2 = tmp1.to_projective(); // tmp2 =    (prev) in P2 coords
    tmp1 = tmp2.double(); // tmp1 =  2*(prev) in P1xP1 coords
    tmp2 = tmp1.to_projective(); // tmp2 =  2*(prev) in P2 coords
    tmp1 = tmp2.double(); // tmp1 =  4*(prev) in P1xP1 coords
    tmp2 = tmp1.to_projective(); // tmp2 =  4*(prev) in P2 coords
    tmp1 = tmp2.double(); // tmp1 =  8*(prev) in P1xP1 coords
    tmp2 = tmp1.to_projective(); // tmp2 =  8*(prev) in P2 coords
    tmp1 = tmp2.double(); // tmp1 = 16*(prev) in P1xP1 coords
    let tmp3 = tmp1.to_extended(); // tmp3 = 16*(prev) in P3 coords
    tmp1 = &tmp3 + &lookup_table.select(scalar_digits[round]);
    (tmp1, tmp2, tmp3)
}
