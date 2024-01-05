#[macro_export]
macro_rules! rpc {
    ($ctx: ident) => {
        #[allow(non_snake_case)]
        pub fn $ctx(&mut self, ctx: $ctx) {
            ctx.validate(self).unwrap();
            ctx.actuate(self).unwrap();
        }
    };
}

#[macro_export]
macro_rules! view {
    ($ctx: ident, $ret: ident) => {
        paste! {
            pub fn [<$ctx:snake>](&mut self, ctx: $ctx) -> $ret {
                ctx.actuate(self).unwrap()
            }
        }
    };
}

#[macro_export]
macro_rules! json_buf {
    ($x:tt) => {
        json!($x).to_string().as_bytes().to_vec()
    };
}
