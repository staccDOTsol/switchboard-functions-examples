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

//! Serial implementations of field, scalar, point arithmetic.
//!
//! When the vector backend is disabled, the crate uses the
//! mixed-model strategy for implementing point operations and scalar
//! multiplication; see the [`curve_models`](self::curve_models) and
//! [`scalar_mul`](self::scalar_mul) documentation for more
//! information.
//!
//! When the vector backend is enabled, the field and scalar
//! implementations are still used for non-vectorized operations.
//!
//! Note: at this time the `u32` and `u64` backends cannot be built
//! together.

pub mod u64;

pub mod curve_models;

pub mod scalar_mul;
