# CORS Configuration for ASP.NET Backend

## Error
```
Access to XMLHttpRequest at 'http://localhost:5000/api/auth/register' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution

Add CORS configuration to your ASP.NET backend's `Program.cs` or `Startup.cs`:

### For .NET 6+ (Program.cs)

```csharp
var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins("http://localhost:3000")  // React dev server
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

// IMPORTANT: Use CORS before Authorization
app.UseCors("AllowReactApp");

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

### For .NET 5 and earlier (Startup.cs)

```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddControllers();
        
        // Add CORS
        services.AddCors(options =>
        {
            options.AddPolicy("AllowReactApp", policy =>
            {
                policy.WithOrigins("http://localhost:3000")
                      .AllowAnyHeader()
                      .AllowAnyMethod()
                      .AllowCredentials();
            });
        });
    }

    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        if (env.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
        }

        app.UseHttpsRedirection();
        app.UseRouting();
        
        // IMPORTANT: Use CORS before Authorization
        app.UseCors("AllowReactApp");
        
        app.UseAuthentication();
        app.UseAuthorization();

        app.UseEndpoints(endpoints =>
        {
            endpoints.MapControllers();
        });
    }
}
```

### For Production

Update the CORS policy to include your production domain:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",           // Development
                "https://yourdomain.com"           // Production
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});
```

### Quick Fix for Development Only

If you want to allow all origins during development (NOT recommended for production):

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

app.UseCors("AllowAll");
```

**⚠️ Warning**: Never use `AllowAnyOrigin()` in production!

## Checklist

- [ ] Add `AddCors()` to services
- [ ] Create CORS policy with React app origin
- [ ] Call `UseCors()` BEFORE `UseAuthorization()`
- [ ] Restart your ASP.NET backend
- [ ] Test the React app again

## Verification

After configuring CORS, you should see these headers in the response:

```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
```

You can verify in browser DevTools → Network → Select request → Headers tab
