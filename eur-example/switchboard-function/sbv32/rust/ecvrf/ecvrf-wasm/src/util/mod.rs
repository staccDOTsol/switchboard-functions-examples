// Borrowed from Andrew Poelstra's rust-bitcoin library
/// An iterator that returns pairs of elements
pub struct Pair<I>
where
    I: Iterator,
{
    iter: I,
    last_elem: Option<I::Item>,
}

impl<I: Iterator> Iterator for Pair<I> {
    type Item = (I::Item, I::Item);

    #[inline]
    fn next(&mut self) -> Option<(I::Item, I::Item)> {
        let elem1 = self.iter.next();
        if elem1.is_none() {
            None
        } else {
            let elem2 = self.iter.next();
            if elem2.is_none() {
                self.last_elem = elem1;
                None
            } else {
                Some((elem1.unwrap(), elem2.unwrap()))
            }
        }
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        match self.iter.size_hint() {
            (n, None) => (n / 2, None),
            (n, Some(m)) => (n / 2, Some(m / 2)),
        }
    }
}

impl<I: Iterator> Pair<I> {
    /// Returns the last element of the iterator if there were an odd
    /// number of elements remaining before it was Pair-ified.
    #[inline]
    pub fn remainder(self) -> Option<I::Item> {
        self.last_elem
    }
}

/// Returns an iterator that returns elements of the original iterator 2 at a time
pub trait Pairable: Sized + Iterator {
    /// Returns an iterator that returns elements of the original iterator 2 at a time
    fn pair(self) -> Pair<Self>;
}

impl<I: Iterator> Pairable for I {
    /// Creates an iterator that yields pairs of elements from the underlying
    /// iterator, yielding `None` when there are fewer than two elements to
    /// return.
    #[inline]
    fn pair(self) -> Pair<I> {
        Pair {
            iter: self,
            last_elem: None,
        }
    }
}

pub fn hex_bytes(s: &str) -> Result<Vec<u8>, &'static str> {
    let mut v = vec![];
    let mut iter = s.chars().pair();
    // Do the parsing
    iter.by_ref().fold(Ok(()), |e, (f, s)| {
        if e.is_err() {
            e
        } else {
            match (f.to_digit(16), s.to_digit(16)) {
                (None, _) => Err("unexpected hex digit"),
                (_, None) => Err("unexpected hex digit"),
                (Some(f), Some(s)) => {
                    v.push((f * 0x10 + s) as u8);
                    Ok(())
                }
            }
        }
    })?;
    // Check that there was no remainder
    match iter.remainder() {
        Some(_) => Err("hexstring of odd length"),
        None => Ok(v),
    }
}

/// Convert a slice of u8 to a hex string
pub fn to_hex(s: &[u8]) -> String {
    let r: Vec<String> = s.to_vec().iter().map(|b| format!("{:02x}", b)).collect();
    return r.connect("");
}
