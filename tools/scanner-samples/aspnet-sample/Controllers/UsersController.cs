using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    /// <summary>List users</summary>
    [HttpGet]
    public IActionResult List() => Ok();

    [HttpGet("{id}")]
    public IActionResult Get(string id) => Ok();

    [HttpPost]
    public IActionResult Create([FromBody] UserDto dto) => Ok();

    [Authorize]
    [HttpDelete("{id}")]
    public IActionResult Delete(string id) => Ok();
}
