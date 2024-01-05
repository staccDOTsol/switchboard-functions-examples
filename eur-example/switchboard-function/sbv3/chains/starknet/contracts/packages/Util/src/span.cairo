use core::integer::U32DivRem;
use starknet::storage_access::StorageAddress;
use starknet::storage_access::StorageBaseAddress;
use starknet::storage_access::Store;
use starknet::storage_access::SyscallResult;
use starknet::storage_access::storage_address_from_base;
use starknet::storage_access::storage_address_from_base_and_offset;
use starknet::storage_access::storage_address_to_felt252;
use starknet::storage_access::storage_base_address_from_felt252;

#[generate_trait]
impl SpanImpl<T, impl TCopy: Copy<T>, impl TDrop: Drop<T>> of SpanImplTrait<T> {
    fn filter<impl TPartialEq: PartialEq<T>>(self: @Span<T>, filtered: T) -> Span<T> {
        let mut old = self.clone();
        let mut new = array![];
        loop {
            match old.pop_front() {
                Option::Some(value) => { if (*value != filtered) {
                    new.append(*value);
                } },
                Option::None(_) => { break (); },
            };
        };
        return new.span();
    }
}

impl StoreSpan<
    S, impl SCopy: Copy<S>, impl SDrop: Drop<S>, impl SStore: Store<S>
> of Store<Span<S>> {
    fn read(address_domain: u32, base: StorageBaseAddress) -> SyscallResult::<Span<S>> {
        let span_len: u32 = Store::<usize>::read(address_domain, base)?;
        _span_read_helper::<S>(address_domain, storage_address_from_base(base), span_len)
    }

    fn write(address_domain: u32, base: StorageBaseAddress, value: Span<S>) -> SyscallResult::<()> {
        Store::write(address_domain, base, value.len());
        _span_write_helper::<S>(address_domain, storage_address_from_base(base), value)
    }

    fn read_at_offset(
        address_domain: u32, base: StorageBaseAddress, offset: u8
    ) -> SyscallResult<Span<S>> {
        let span_len: u32 = Store::<usize>::read_at_offset(address_domain, base, offset)?;
        let storage_address = storage_address_from_base_and_offset(base, offset);
        _span_read_helper::<S>(address_domain, storage_address, span_len)
    }

    fn write_at_offset(
        address_domain: u32, base: StorageBaseAddress, offset: u8, value: Span<S>
    ) -> SyscallResult<()> {
        Store::write_at_offset(address_domain, base, offset, value.len());
        let storage_address = storage_address_from_base_and_offset(base, offset);
        _span_write_helper(address_domain, storage_address, value)
    }

    fn size() -> u8 {
        Store::<usize>::size()
    }
}

fn _span_read_helper<S, impl SCopy: Copy<S>, impl SDrop: Drop<S>, impl SStore: Store<S>>(
    address_domain: u32, storage_address: StorageAddress, span_len: usize
) -> SyscallResult<Span<S>> {
    let mut index = 0;
    let mut returned: Array<S> = array![];
    loop {
        // Once the returned array reaches the expected size, break. This is at the head of the loop to address the case of len == 0.
        if returned.len() == span_len {
            break ();
        }

        let (base, offset) = _calculate_base_and_offset_for_index(
            storage_address, index, Store::<S>::size()
        );
        match (Store::<S>::read_at_offset(address_domain, base, offset)) {
            Result::Ok(r) => returned.append(r),
            Result::Err(e) => panic(e)
        }
        index += 1;
    };
    SyscallResult::Ok(returned.span())
}

fn _span_write_helper<S, impl SCopy: Copy<S>, impl SDrop: Drop<S>, impl SStore: Store<S>>(
    address_domain: u32, storage_address: StorageAddress, mut span: Span<S>
) -> SyscallResult<()> {
    let mut index = 0;
    loop {
        match span.pop_front() {
            Option::Some(el) => {
                let (base, offset) = _calculate_base_and_offset_for_index(
                    storage_address, index, Store::<S>::size()
                );
                Store::<S>::write_at_offset(address_domain, base, offset, *el);
                index += 1;
            },
            Option::None(_) => { break; },
        };
    };
    Result::Ok(())
}

fn _calculate_base_and_offset_for_index(
    storage_address: StorageAddress, index: u32, storage_size: u8
) -> (StorageBaseAddress, u8) {
    let max_elements: usize = 256 / storage_size.into();
    let (key, offset) = U32DivRem::div_rem(index, max_elements.try_into().unwrap());

    // hash the base address and the key which is the segment number
    let addr_elements = array![storage_address_to_felt252(storage_address), key.into()];
    let segment_base = storage_base_address_from_felt252(
        poseidon::poseidon_hash_span(addr_elements.span())
    );
    (segment_base, offset.try_into().unwrap() * storage_size)
}

