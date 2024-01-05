use crate::*;

pub trait ToU8 {
    fn to_u8(&self) -> u8;
}
impl ToU8 for bool {
    fn to_u8(&self) -> u8 {
        if *self {
            1
        } else {
            0
        }
    }
}
impl ToU8 for &bool {
    fn to_u8(&self) -> u8 {
        if **self {
            1
        } else {
            0
        }
    }
}
pub trait ToBool {
    fn to_bool(&self) -> bool;
}

impl ToBool for u8 {
    fn to_bool(&self) -> bool {
        !matches!(*self, 0)
    }
}
impl ToBool for &u8 {
    fn to_bool(&self) -> bool {
        !matches!(**self, 0)
    }
}
/// An enum representing a boolean flag which can be locked.
/// Byte #0: 0 = Disabled, 1 = Enabled
/// Byte #1: 0 = Unlocked, 1 = Locked
#[repr(u8)]
#[derive(
    Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace,
)]
pub enum BoolWithLock {
    #[default]
    Disabled, // 0 : 00000000
    Enabled,        // 1 : 00000001 : 1 << 0
    DisabledLocked, // 2 : 00000010 : 1 << 1
    EnabledLocked,  // 3 : 00000011
}
impl BoolWithLock {
    pub fn is_enabled(&self) -> bool {
        let byte: u8 = (*self).into();
        byte & (1 << 0) != 0
    }

    pub fn is_disabled(&self) -> bool {
        !self.is_enabled()
    }

    pub fn is_locked(&self) -> bool {
        let byte: u8 = (*self).into();
        byte & (1 << 1) != 0
    }

    /// Converts boolean flags into a bitfield enum value.
    ///
    /// # Arguments
    ///
    /// * `is_enabled` - A boolean flag indicating if the feature is enabled.
    /// * `is_locked` - A boolean flag indicating if the feature is locked.
    ///
    /// # Returns
    ///
    /// A bitfield enum value representing the input flags.
    fn from_flags(is_enabled: bool, is_locked: Option<bool>) -> Self {
        let mut value: u8 = 0;

        if is_enabled {
            value |= 1 << 0; // Set the 0th bit if enabled
        }

        if is_locked.unwrap_or_default() {
            value |= 1 << 1; // Set the 1st bit if locked
        }

        value.into()
    }

    /// Asserts that the configuration parameter is unlocked.
    pub fn assert_unlocked(&self) -> Result<()> {
        if self.is_locked() {
            return Err(error!(SwitchboardError::ConfigParameterLocked));
        }

        Ok(())
    }

    /// Updates the value of the enum with a new value.
    ///
    /// # Arguments
    ///
    /// * `new_value` - A reference to a `BoolWithLock` struct containing the new value.
    ///
    /// # Errors
    ///
    /// Returns an error if the enum is locked and an update attempt is made.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the update is successful.
    pub fn update(&mut self, is_enabled: bool, is_locked: Option<bool>) -> Result<()> {
        self.assert_unlocked()?;

        let new_value = Self::from_flags(is_enabled, is_locked);

        *self = new_value;

        Ok(())
    }

    /// Locks the enum value for further updates. No action taken if the enum is already locked.
    pub fn lock(&mut self) -> Result<()> {
        if self.is_locked() {
            return Ok(());
        }

        let mut val: u8 = (*self).into();
        val |= 1 << 1;

        *self = val.into();

        Ok(())
    }
}
impl From<BoolWithLock> for u8 {
    fn from(value: BoolWithLock) -> Self {
        match value {
            BoolWithLock::Disabled => 0,
            BoolWithLock::Enabled => 1,
            BoolWithLock::DisabledLocked => 2,
            BoolWithLock::EnabledLocked => 3,
        }
    }
}
impl From<u8> for BoolWithLock {
    fn from(value: u8) -> Self {
        match value {
            1 => BoolWithLock::Enabled,
            2 => BoolWithLock::DisabledLocked,
            3 => BoolWithLock::EnabledLocked,
            _ => BoolWithLock::default(),
        }
    }
}

/// An enum representing a heirarchy of resources that can modify a field.
#[repr(u8)]
#[derive(
    Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace,
)]
pub enum ResourceLevel {
    #[default]
    None = 0, // 0
    /// The resource's authority has set this value.
    Authority,
    /// The resource function's authority has set this value.
    Function,
    /// The resource queue's authority has set this value.
    Queue,
}
impl PartialOrd for ResourceLevel {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for ResourceLevel {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}
impl From<ResourceLevel> for u8 {
    fn from(value: ResourceLevel) -> Self {
        match value {
            ResourceLevel::Authority => 1,
            ResourceLevel::Function => 2,
            ResourceLevel::Queue => 3,
            _ => 0,
        }
    }
}
impl From<u8> for ResourceLevel {
    fn from(value: u8) -> Self {
        match value {
            1 => ResourceLevel::Authority,
            2 => ResourceLevel::Function,
            3 => ResourceLevel::Queue,
            _ => ResourceLevel::default(),
        }
    }
}
impl From<ResourceLevel> for bool {
    fn from(value: ResourceLevel) -> Self {
        !matches!(value, ResourceLevel::None)
    }
}
impl ResourceLevel {
    pub fn update(&mut self, access_level: &ResourceLevel, reset: Option<bool>) -> Result<()> {
        let target_value = if reset.unwrap_or_default() {
            ResourceLevel::None
        } else {
            *access_level
        };

        // No action needed
        if self == &target_value {
            return Ok(());
        }

        // If insufficient access to change the value
        if self > &mut access_level.clone() {
            msg!(
                "ResourceLevel: curr ({:?}), target ({:?}), access_level ({:?})",
                self,
                target_value,
                access_level
            );
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        *self = target_value;

        Ok(())
    }
}

#[repr(u8)]
#[derive(
    Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace,
)]
pub enum RoutineStatus {
    #[default]
    None = 0, // 0
    Active,
    NonExecutable,
    OutOfFunds,
}
impl RoutineStatus {
    pub fn is_active(&self) -> bool {
        matches!(self, RoutineStatus::Active)
    }
}
impl From<RoutineStatus> for u8 {
    fn from(value: RoutineStatus) -> Self {
        match value {
            RoutineStatus::Active => 1,
            RoutineStatus::NonExecutable => 2,
            RoutineStatus::OutOfFunds => 3,
            _ => 0,
        }
    }
}
impl From<u8> for RoutineStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => RoutineStatus::Active,
            2 => RoutineStatus::NonExecutable,
            3 => RoutineStatus::OutOfFunds,
            _ => RoutineStatus::default(),
        }
    }
}

// Currently Anchor does not calculate the enum variant values from the compiled code.
// This will be resolved in the anchor PR https://github.com/coral-xyz/anchor/pull/2011.
// Until then we need to add padding to our enum variants so they get calculated correctly
// by the current IDL logic which starts at 0 and increments.
#[repr(u8)]
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum FunctionStatus {
    #[default]
    None = 0, // 0
    Active = 1,        // 1
    NonExecutable = 2, // 2
    Error = 3,         // 3
    Expired = 4,       // 4
    None5 = 5,         // 5
    None6 = 6,         // 6
    None7 = 7,         // 7
    // We should deprecate this
    OutOfFunds = 8,          // 8
    None9 = 9,               // 9
    None10 = 10,             // 10
    None11 = 11,             // 11
    None12 = 12,             // 12
    None13 = 13,             // 13
    None14 = 14,             // 14
    None15 = 15,             // 15
    InvalidPermissions = 16, // 16
}
impl From<FunctionStatus> for u8 {
    fn from(value: FunctionStatus) -> Self {
        match value {
            FunctionStatus::Active => 1,
            FunctionStatus::NonExecutable => 2,
            FunctionStatus::Expired => 4,
            FunctionStatus::OutOfFunds => 8,
            FunctionStatus::InvalidPermissions => 16,
            _ => 0,
        }
    }
}
impl From<u8> for FunctionStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => FunctionStatus::Active,
            2 => FunctionStatus::NonExecutable,
            4 => FunctionStatus::Expired,
            8 => FunctionStatus::OutOfFunds,
            16 => FunctionStatus::InvalidPermissions,
            _ => FunctionStatus::default(),
        }
    }
}

#[repr(u8)]
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum FundingStatus {
    #[default]
    Inactive = 0,
    Active = 1,
}
impl From<FundingStatus> for u8 {
    fn from(value: FundingStatus) -> Self {
        match value {
            FundingStatus::Active => 1,
            _ => 0,
        }
    }
}
impl From<u8> for FundingStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => FundingStatus::Active,
            _ => FundingStatus::default(),
        }
    }
}

#[repr(u8)]
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum RequestStatus {
    #[default]
    None = 0,
    RequestPending = 1,
    RequestCancelled = 2,
    RequestFailure = 3,
    RequestExpired = 4,
    RequestSuccess = 5,
}
impl RequestStatus {
    pub fn is_active(&self) -> bool {
        matches!(self, RequestStatus::RequestPending)
    }
}
impl From<RequestStatus> for u8 {
    fn from(value: RequestStatus) -> Self {
        match value {
            RequestStatus::RequestPending => 1,
            RequestStatus::RequestCancelled => 2,
            RequestStatus::RequestFailure => 3,
            RequestStatus::RequestExpired => 4,
            RequestStatus::RequestSuccess => 5,
            _ => 0,
        }
    }
}
impl From<u8> for RequestStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => RequestStatus::RequestPending,
            2 => RequestStatus::RequestCancelled,
            3 => RequestStatus::RequestFailure,
            4 => RequestStatus::RequestExpired,
            5 => RequestStatus::RequestSuccess,
            _ => RequestStatus::default(),
        }
    }
}

#[repr(u8)]
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum VerificationStatus {
    #[default]
    None = 0, // 0
    VerificationPending = 1,  // 1
    VerificationFailure = 2,  // 2
    None3 = 3,                // 3
    VerificationSuccess = 4,  // 4
    None5 = 5,                // 5
    None6 = 6,                // 6
    None7 = 7,                // 7
    VerificationOverride = 8, // 8
}
impl From<VerificationStatus> for u8 {
    fn from(value: VerificationStatus) -> Self {
        match value {
            VerificationStatus::VerificationPending => 1,
            VerificationStatus::VerificationFailure => 2,
            VerificationStatus::VerificationSuccess => 4,
            VerificationStatus::VerificationOverride => 8,
            _ => 0,
        }
    }
}
impl From<u8> for VerificationStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => VerificationStatus::VerificationPending,
            2 => VerificationStatus::VerificationFailure,
            4 => VerificationStatus::VerificationSuccess,
            8 => VerificationStatus::VerificationOverride,
            _ => VerificationStatus::default(),
        }
    }
}

#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum SwitchboardAttestationPermission {
    #[default]
    None = 0,
    PermitNodeheartbeat = 1, // 1
    PermitQueueUsage = 2,    // 2
}
impl From<SwitchboardAttestationPermission> for u32 {
    fn from(value: SwitchboardAttestationPermission) -> Self {
        match value {
            SwitchboardAttestationPermission::PermitNodeheartbeat => 1,
            SwitchboardAttestationPermission::PermitQueueUsage => 2,
            _ => 0,
        }
    }
}
impl From<u32> for SwitchboardAttestationPermission {
    fn from(value: u32) -> Self {
        match value {
            1 => SwitchboardAttestationPermission::PermitNodeheartbeat,
            2 => SwitchboardAttestationPermission::PermitQueueUsage,
            _ => SwitchboardAttestationPermission::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bool_to_u8_conversion() {
        // false
        assert_eq!(false.to_u8(), 0);

        // true
        assert_eq!(true.to_u8(), 1);
    }

    #[test]
    fn test_u8_to_bool_conversion() {
        // false
        assert!(!0.to_bool());

        for i in 1u8..=255u8 {
            assert!(i.to_bool());
        }
    }

    #[test]
    fn test_bool_with_lock() {
        // Init from flags
        let mut my_bool = BoolWithLock::from_flags(false, None);
        assert!(my_bool.is_disabled());
        assert!(!my_bool.is_locked());

        // Update the value
        let update_result = my_bool.update(true, None);
        assert!(my_bool.is_enabled());
        assert!(!my_bool.is_locked());
        assert!(update_result.is_ok());

        // Lock the value
        let update_result = my_bool.update(true, Some(true));
        assert!(my_bool.is_enabled());
        assert!(my_bool.is_locked());
        assert!(update_result.is_ok());

        // Fail to update the value after locking
        let failed_update_result = my_bool.update(false, None);
        assert!(my_bool.is_enabled());
        assert!(my_bool.is_locked());
        assert!(failed_update_result.is_err());
        assert_eq!(
            failed_update_result,
            Err(error!(SwitchboardError::ConfigParameterLocked))
        );
    }

    #[test]
    fn test_bool_with_lock_is_locked() {
        let mut locked_bool = BoolWithLock::from_flags(true, Some(true));

        let update_result = locked_bool.update(false, None);
        assert!(update_result.is_err());
        assert_eq!(
            update_result,
            Err(error!(SwitchboardError::ConfigParameterLocked))
        );
        assert!(locked_bool.is_enabled());
    }

    #[test]
    fn test_update_resource_with_same_level() {
        let mut resource_level = ResourceLevel::Function;
        let access_level = ResourceLevel::Function;
        let result = resource_level.update(&access_level, None);
        assert!(result.is_ok());
        assert_eq!(resource_level, ResourceLevel::Function);
    }

    #[test]
    fn test_update_resource_with_lower_level() {
        let mut resource_level = ResourceLevel::Function;
        let access_level = ResourceLevel::Authority;
        let result = resource_level.update(&access_level, None);
        assert_eq!(result, Err(error!(SwitchboardError::IllegalExecuteAttempt)));
        assert_eq!(resource_level, ResourceLevel::Function); // Ensure the level hasn't changed
    }

    #[test]
    fn test_update_resource_with_higher_level() {
        let mut resource_level = ResourceLevel::Authority;
        let access_level = ResourceLevel::Function;
        let result = resource_level.update(&access_level, None);
        assert!(result.is_ok());
        assert_eq!(resource_level, ResourceLevel::Function); // The level should be updated
    }

    #[test]
    fn test_update_resource_with_reset() {
        let mut resource_level = ResourceLevel::Function;
        let access_level = ResourceLevel::Function; // Access level shouldn't matter with reset
        let result = resource_level.update(&access_level, Some(true));
        assert!(result.is_ok());
        assert_eq!(resource_level, ResourceLevel::None); // Should be reset to None
    }
}

// /// An enum representing a boolean flag which can be locked.
// /// Byte #0: 0 = Disabled, 1 = Enabled
// /// Byte #1: 0 = Unlocked, 1 = Locked
// /// Byte #2: 0 = FnAuth Not Required, 1 = FnAuth Required
// #[repr(u8)]
// #[derive(
//     Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace,
// )]
// pub enum BoolWithAuthLock {
//     #[default]
//     Disabled, // 0 : 00000000
//     Enabled,        // 1 : 00000001 : 1 << 0
//     DisabledLocked, // 2 : 00000010 : 1 << 1
//     EnabledLocked,  // 3 : 00000011
//     Nothing4,       // 4 : 00000100 : 1 << 2
//     FnAuthRequired, // 5 : 00000101
//     Nothing6,       // 6 : 00000110
//     FnAuthRequiredLocked, // 7 : 00000111

//                     // // New setting
//                     // Nothing8,                           // 8 : 00001000 : 1 << 3
//                     // EnabledWithNewSetting,              // 9 : 00001001
//                     // DisabledLockedWithNewSetting,       // 10 : 00001010
//                     // EnableLockedWithNewSetting,         // 11 : 00001011
//                     // Nothing12,                          // 12 : 00001100
//                     // FnAuthRequiredWithNewSetting,       // 13 : 00001101
//                     // Nothing14,                          // 14 : 00001110
//                     // FnAuthRequiredLockedWithNewSetting, // 15 : 00001111
// }
// impl BoolWithAuthLock {
//     pub fn is_enabled(&self) -> bool {
//         self.try_to_vec().unwrap()[0] == 1
//     }

//     pub fn is_disabled(&self) -> bool {
//         self.try_to_vec().unwrap()[0] == 0
//     }

//     pub fn is_locked(&self) -> bool {
//         self.try_to_vec().unwrap()[1] == 1
//     }

//     pub fn is_fn_auth_required(&self) -> bool {
//         self.try_to_vec().unwrap()[2] == 1
//     }

//     /// Converts boolean flags into a bitfield enum value.
//     ///
//     /// # Arguments
//     ///
//     /// * `is_enabled` - A boolean flag indicating if the feature is enabled.
//     /// * `is_locked` - A boolean flag indicating if the feature is locked.
//     /// * `fn_auth_required` - A boolean flag indicating if function authorization is required.
//     ///
//     /// # Returns
//     ///
//     /// A bitfield enum value representing the input flags.
//     pub fn from_flags(
//         is_enabled: bool,
//         is_locked: Option<bool>,
//         fn_auth_required: Option<bool>,
//     ) -> Self {
//         let mut value: u8 = 0;

//         if is_enabled {
//             value |= 1 << 0; // Set the 0th bit if enabled
//         }

//         if is_locked.unwrap_or_default() {
//             value |= 1 << 1; // Set the 1st bit if locked
//         }

//         if fn_auth_required.unwrap_or_default() {
//             value |= 1 << 2; // Set the 2nd bit if fn_auth_required is true
//         }

//         value.into()
//     }

//     /// Asserts that the configuration parameter is unlocked.
//     pub fn assert_unlocked(&self) -> Result<()> {
//         if self.is_locked() {
//             return Err(error!(SwitchboardError::ConfigParameterLocked));
//         }

//         Ok(())
//     }

//     /// Updates the value of the enum with a new value.
//     ///
//     /// # Arguments
//     ///
//     /// * `is_enabled` - Whether the flag should be enabled.
//     /// * `is_locked` - Whether the flag should be locked.
//     /// * `fn_auth_required` - Whether the flag should require function authority to sign new requests.
//     ///
//     /// # Errors
//     ///
//     /// Returns an error if the enum is locked and an update attempt is made.
//     ///
//     /// # Returns
//     ///
//     /// Returns `Ok(())` if the update is successful.
//     pub fn update(
//         &mut self,
//         is_enabled: bool,
//         is_locked: Option<bool>,
//         fn_auth_required: Option<bool>,
//     ) -> Result<()> {
//         self.assert_unlocked()?;

//         let new_value = Self::from_flags(is_enabled, is_locked, fn_auth_required);

//         *self = new_value;

//         Ok(())
//     }
// }
// impl From<BoolWithAuthLock> for u8 {
//     fn from(value: BoolWithAuthLock) -> Self {
//         match value {
//             BoolWithAuthLock::Disabled => 0,
//             BoolWithAuthLock::Enabled => 1,
//             BoolWithAuthLock::DisabledLocked => 2,
//             BoolWithAuthLock::EnabledLocked => 3,
//             BoolWithAuthLock::FnAuthRequired => 5,
//             BoolWithAuthLock::FnAuthRequiredLocked => 7,
//             _ => 0,
//         }
//     }
// }
// impl From<u8> for BoolWithAuthLock {
//     fn from(value: u8) -> Self {
//         match value {
//             1 => BoolWithAuthLock::Enabled,
//             2 => BoolWithAuthLock::DisabledLocked,
//             3 => BoolWithAuthLock::EnabledLocked,
//             5 => BoolWithAuthLock::FnAuthRequired,
//             7 => BoolWithAuthLock::FnAuthRequiredLocked,
//             _ => BoolWithAuthLock::default(),
//         }
//     }
// }

// TODO: evaluate ordering of fields so this doesnt break existing schemas that use a strict u64 LE
// #[derive(Default, Eq, PartialEq, AnchorDeserialize, InitSpace)]
// #[zero_copy(unsafe)]
// #[repr(packed)]
// pub struct U32WithLock {
//     pub value: u32,
//     pub _padding: [u8; 3],
//     pub is_locked: u8,
// }
// impl std::fmt::Debug for U32WithLock {
//     fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//         let locked_label = if self.is_locked() { "true" } else { "false" };
//         write!(
//             f,
//             "U32 {{ value: {}, is_locked: {} }}",
//             self.value(),
//             locked_label
//         )
//     }
// }

// impl U32WithLock {
//     pub fn is_unlocked(&self) -> bool {
//         self.is_locked != 0
//     }

//     pub fn is_locked(&self) -> bool {
//         !self.is_unlocked()
//     }

//     pub fn value(&self) -> u32 {
//         {
//             self.value
//         }
//     }

//     pub fn from(val: u32) -> Self {
//         Self {
//             value: val,
//             _padding: [0u8; 3],
//             is_locked: 0,
//         }
//     }

//     pub fn as_u64(&self) -> u64 {
//         let u32_val: u32 = self.value();
//         let val: u64 = u32_val.into();
//         val
//     }

//     pub fn is_zero(&self) -> bool {
//         self.value() == 0
//     }

//     pub fn assert_unlocked(&self) -> Result<()> {
//         if self.is_locked() {
//             return Err(error!(SwitchboardError::ConfigParameterLocked));
//         }

//         Ok(())
//     }

//     pub fn update(&mut self, new_value: u32) -> Result<()> {
//         self.assert_unlocked()?;

//         self.value = new_value;

//         Ok(())
//     }
// }

// #[derive(
//     Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace,
// )]
// #[repr(packed)]
// pub struct U32WithLockBytes {
//     pub bytes: [u8; 8],
// }
// impl U32WithLockBytes {
//     pub fn is_unlocked(&self) -> bool {
//         self.bytes[7] != 0
//     }

//     pub fn is_locked(&self) -> bool {
//         !self.is_unlocked()
//     }

//     pub fn value(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.bytes[0..4]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn set_value(&mut self, val: u32) -> Result<()> {
//         self.assert_unlocked()?;

//         let val_bytes = val.to_le_bytes();
//         self.bytes[0..4].copy_from_slice(&val_bytes);

//         Ok(())
//     }

//     pub fn from(val: u32) -> Self {
//         let mut bytes = [0u8; 8];
//         bytes[0..4].copy_from_slice(&val.to_le_bytes());

//         Self { bytes }
//     }

//     pub fn as_u64(&self) -> u64 {
//         let u32_val: u32 = self.value();
//         let val: u64 = u32_val.into();
//         val
//     }

//     pub fn is_zero(&self) -> bool {
//         self.value() == 0
//     }

//     pub fn assert_unlocked(&self) -> Result<()> {
//         if self.is_locked() {
//             return Err(error!(SwitchboardError::ConfigParameterLocked));
//         }

//         Ok(())
//     }

//     pub fn update(&mut self, new_value: u32) -> Result<()> {
//         self.set_value(new_value)
//     }
// }
