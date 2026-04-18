using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshAsync(string refreshToken);
    Task RevokeAsync(string refreshToken);
    Task<string> ForgotPasswordAsync(string email);
    Task ResetPasswordAsync(string token, string newPassword);
}
