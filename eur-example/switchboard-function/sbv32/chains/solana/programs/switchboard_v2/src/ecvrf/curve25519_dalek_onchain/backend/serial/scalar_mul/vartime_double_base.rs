// -*- mode: rust; -*-
//
// This file is part of curve25519-dalek.
// Copyright (c) 2016-2021 isis lovecruft
// Copyright (c) 2016-2019 Henry de Valence
// See LICENSE for licensing information.
//
// Authors:
// - isis agora lovecruft <isis@patternsinthevoid.net>
// - Henry de Valence <hdevalence@hdevalence.ca>
#![allow(non_snake_case)]

use crate::ecvrf::curve25519_dalek_onchain::backend::serial::curve_models::ProjectiveNielsPoint;
use crate::ecvrf::curve25519_dalek_onchain::constants;
use crate::ecvrf::curve25519_dalek_onchain::traits::Identity;
use crate::ecvrf::curve25519_dalek_onchain::window::NafLookupTable5;
use crate::EdwardsPoint;
use crate::ProjectivePoint;
use crate::Scalar;

/// Compute \\(aA + bB\\) in variable time, where \\(B\\) is the Ed25519 basepoint.
pub fn mul(a: &Scalar, A: &EdwardsPoint, b: &Scalar) -> EdwardsPoint {
    let a_naf = a.non_adjacent_form(5);
    let b_naf = b.non_adjacent_form(8);

    // Find starting index
    let mut i: usize = 255;
    for j in (0..256).rev() {
        i = j;
        if a_naf[i] != 0 || b_naf[i] != 0 {
            break;
        }
    }

    let table_A = NafLookupTable5::<ProjectiveNielsPoint>::from(A);
    let table_B = &constants::AFFINE_ODD_MULTIPLES_OF_BASEPOINT;

    let mut r = ProjectivePoint::identity();
    loop {
        let mut t = r.double();

        if a_naf[i] > 0 {
            t = &t.to_extended() + &table_A.select(a_naf[i] as usize);
        } else if a_naf[i] < 0 {
            t = &t.to_extended() - &table_A.select(-a_naf[i] as usize);
        }

        if b_naf[i] > 0 {
            t = &t.to_extended() + &table_B.select(b_naf[i] as usize);
        } else if b_naf[i] < 0 {
            t = &t.to_extended() - &table_B.select(-b_naf[i] as usize);
        }

        r = t.to_projective();

        if i == 0 {
            break;
        }
        i -= 1;
    }

    r.to_extended()
}
