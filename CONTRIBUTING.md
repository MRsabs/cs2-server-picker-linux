# Contributing to CS2 Server Picker

Thank you for considering contributing! Here are some guidelines:

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes**
4. **Test thoroughly**: Build and test the executable
5. **Commit your changes**: Use clear commit messages
6. **Push to your fork**: `git push origin feature/your-feature`
7. **Open a Pull Request**

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/cs2-server-picker-linux.git
cd cs2-server-picker-linux

# Build
deno task build

# Test
sudo ./cs2-server-picker
```

## Code Guidelines

- Use TypeScript best practices
- Maintain consistent code style with existing code
- Always validate user input (especially IPs)
- Test with `sudo` before submitting
- Update documentation if adding features

## Security

- Never block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x)
- Always validate IPs before routing operations
- Test state file management thoroughly
- Consider edge cases (permissions, missing files, API failures)

## Testing Checklist

- [ ] Builds successfully with `deno task build`
- [ ] Runs without errors as root
- [ ] Block/unblock operations work correctly
- [ ] State file persists correctly
- [ ] No private IPs are blocked
- [ ] Menu navigation works
- [ ] Double-click launcher works (if applicable)

## Reporting Issues

When reporting issues, include:
- OS and version
- Deno version
- Full error message
- Steps to reproduce

## Questions?

Open an issue for discussion before working on major changes.

Thank you for helping improve CS2 Server Picker!
