use std::error;
use std::fmt;

// use bincode;
// use rand;

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

#[derive(Debug)]
pub enum Error {
    InvalidPublicKey,
    SerializationError(bincode::Error),
    DeserializationError(bincode::Error),
    InvalidDataError,
    OSRNGError(rand::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match *self {
            Error::InvalidPublicKey => f.write_str(error::Error::description(self)),
            Error::SerializationError(ref e) => fmt::Display::fmt(e, f),
            Error::DeserializationError(ref e) => fmt::Display::fmt(e, f),
            Error::InvalidDataError => f.write_str(error::Error::description(self)),
            Error::OSRNGError(ref e) => fmt::Display::fmt(e, f),
        }
    }
}

impl error::Error for Error {
    fn cause(&self) -> Option<&error::Error> {
        match *self {
            Error::InvalidPublicKey => None,
            Error::SerializationError(ref e) => Some(e),
            Error::DeserializationError(ref e) => Some(e),
            Error::InvalidDataError => None,
            Error::OSRNGError(ref e) => Some(e),
        }
    }

    fn description(&self) -> &str {
        match *self {
            Error::InvalidPublicKey => "Invalid public key",
            Error::SerializationError(ref e) => e.description(),
            Error::DeserializationError(ref e) => e.description(),
            Error::InvalidDataError => "No data could be found",
            Error::OSRNGError(ref e) => e.description(),
        }
    }
}
