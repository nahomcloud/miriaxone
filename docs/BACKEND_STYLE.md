# Backend style

Backend code targets Python 3.12 and follows Google Python Style conventions:

- Use four-space indentation, type annotations, and descriptive names.
- Use Google-style docstrings for public modules, functions, classes, and methods.
- Validate request data with Pydantic models at the API boundary.
- Keep secrets and deployment settings in environment variables.
- Prefer small, testable functions and explicit exception handling.
- Run the backend tests with `python -m unittest backend.test_auth backend.test_admin -v`.

Ruff and pytest configuration lives in `backend/pyproject.toml`. The existing API module is kept as the compatibility boundary while new behavior should be added in focused modules rather than making route handlers larger.
