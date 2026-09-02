pub mod express;
pub mod fastapi;
pub mod laravel;
pub mod spring;
pub mod aspnet;
pub mod gin;
pub mod generic;

use crate::scanner::models::ScannedRoute;

pub trait RouteParser {
    fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute>;
}

// Provide uniform dispatch helper enum
pub enum AnyParser {
    Express(express::ExpressParser),
    FastAPI(fastapi::FastAPIParser),
    Laravel(laravel::LaravelParser),
    Spring(spring::SpringBootParser),
    AspNet(aspnet::AspNetCoreParser),
    Gin(gin::GinParser),
    Generic(generic::GenericParser),
}

impl AnyParser {
    pub fn parse(&self, file_path: &str, content: &str) -> Vec<ScannedRoute> {
        match self {
            Self::Express(p) => p.parse(file_path, content),
            Self::FastAPI(p) => p.parse(file_path, content),
            Self::Laravel(p) => p.parse(file_path, content),
            Self::Spring(p) => p.parse(file_path, content),
            Self::AspNet(p) => p.parse(file_path, content),
            Self::Gin(p) => p.parse(file_path, content),
            Self::Generic(p) => p.parse(file_path, content),
        }
    }
}
