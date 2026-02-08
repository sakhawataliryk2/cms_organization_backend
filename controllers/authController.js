const User = require("../models/user");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { sendMail } = require("../services/emailService");
const baseUrl = "https://cms-organization.vercel.app";
class AuthController {
  constructor(pool) {
    this.userModel = new User(pool);
    this.signup = this.signup.bind(this);
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
  }

  // Initialize database tables
  async initTables() {
    await this.userModel.initTable();
  }

  // Create initial developer account (only allowed if no users exist)
  async createInitialDeveloper(req, res) {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    try {
      // Check if any users already exist
      const existingUsers = await this.userModel.getAllDetailed();
      if (existingUsers.length > 0) {
        return res.status(403).json({
          success: false,
          message:
            "Initial developer account can only be created when no users exist",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }

      // Enhanced password validation
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: passwordValidation.message,
        });
      }

      // Create developer user
      const user = await this.userModel.create({
        name,
        email,
        password,
        userType: "developer",
        isAdmin: true,
      });

      // Send success response
      res.status(201).json({
        success: true,
        message: "Initial developer account created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: user.token,
        },
      });
    } catch (error) {
      console.error("Error creating initial developer:", error);

      if (error.message === "User with this email already exists") {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      res.status(500).json({
        success: false,
        message: "An error occurred during account creation",
        error:
          process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  // Handle user signup (restricted - only for developers creating other users)
  async signup(req, res) {
    const {
      name,
      email,
      password,
      userType,
      officeId,
      teamId,
      phone,
      phone2,
      title,
      idNumber,
    } = req.body;

    // Input validation
    if (!name || !email || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and user type are required",
      });
    }

    // Check if user is authenticated
    // if (!req.user) {
    //     return res.status(401).json({
    //         success: false,
    //         message: 'Authentication required to create user accounts'
    //     });
    // }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Enhanced password validation
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
      });
    }

    // Validate user type
    const validUserTypes = [
      "candidate",
      "recruiter",
      "developer",
      "admin",
      "owner",
    ];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user type",
      });
    }

    // Role-based creation restrictions (only if req.user exists)
    if (
      req.user &&
      req.user.role === "admin" &&
      (userType === "developer" || userType === "owner")
    ) {
      return res.status(403).json({
        success: false,
        message: "Admins cannot create developer or owner accounts",
      });
    }

    // Validate office and team requirements for non-admin roles
    if (userType === "candidate" || userType === "recruiter") {
      if (!officeId || !teamId) {
        return res.status(400).json({
          success: false,
          message: "Office and team are required for candidates and recruiters",
        });
      }
    }

    try {
      // Create user in database
      const user = await this.userModel.create({
        name,
        email,
        password,
        userType,
        officeId,
        teamId,
        phone,
        phone2,
        title,
        idNumber,
        isAdmin:
          userType === "admin" ||
          userType === "developer" ||
          userType === "owner",
      });

      // Send success response
      res.status(201).json({
        success: true,
        message: "User created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          officeId: user.officeId,
          teamId: user.teamId,
          token: user.token,
        },
      });
    } catch (error) {
      console.error("Error creating user:", error);
      console.error("Error stack:", error.stack);
      console.error("Request body:", req.body);

      if (error.message === "User with this email already exists") {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      res.status(500).json({
        success: false,
        message: "An error occurred during user creation",
        error:
          process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  // Password validation helper method
  validatePassword(password) {
    // Check length
    if (password.length < 8) {
      return {
        isValid: false,
        message: "Password must be at least 8 characters long",
      };
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      return {
        isValid: false,
        message: "Password must contain at least one lowercase letter",
      };
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
      return {
        isValid: false,
        message: "Password must contain at least one uppercase letter",
      };
    }

    // Check for number
    if (!/[0-9]/.test(password)) {
      return {
        isValid: false,
        message: "Password must contain at least one number",
      };
    }

    // Check for special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return {
        isValid: false,
        message: "Password must contain at least one special character",
      };
    }

    return {
      isValid: true,
      message: "Password is valid",
    };
  }

  // Handle user login
  async login(req, res) {
    let { email, password } = req.body;

    // Convert email to lowercase for case-insensitive login
    email = email.toLowerCase().trim();

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    try {
      // Find user by email
      const user = await this.userModel.findByEmail(email);

      // Check if user exists
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Check if user is active
      if (!user.status) {
        return res.status(401).json({
          success: false,
          message: "Your account has been deactivated. Please contact support.",
        });
      }

      // Check if password exists
      if (!user.password) {
        console.error("User found but password field is missing:", user.id);
        return res.status(500).json({
          success: false,
          message: "Account configuration error. Please contact support.",
        });
      }

      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password);

      console.log("IS PASSWORD VALID:", isPasswordValid);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Generate a new JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, userType: user.role },
        process.env.JWT_SECRET || "default_secret_key",
        { expiresIn: "7d" }
      );

      // Update the token in the database
      await this.userModel.updateToken(user.id, token);

      // Send success response with userType for frontend compatibility
      res.status(200).json({
        success: true,
        message: "Login successful",
        token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userType: user.role,
          role: user.role, // Keep for backward compatibility
          token: token,
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      console.error("Error stack:", error.stack);
      console.error("Login request body:", { email: email ? email.substring(0, 5) + "..." : "missing" });
      res.status(500).json({
        success: false,
        message: "An error occurred during login",
        error:
          process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  // Handle user logout
  async logout(req, res) {
    try {
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "No token provided",
        });
      }

      // Find user by token
      const user = await this.userModel.findByToken(token);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      }

      // Clear the token in the database
      await this.userModel.updateToken(user.id, null);

      res.status(200).json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      console.error("Error during logout:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred during logout",
        error:
          process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  // async sendResetPasswordEmail(req, res) {
  //   const { email } = req.body;

  //   if (!email) {
  //     return res.status(400).json({
  //       success: false,
  //       message: "Email is required",
  //     });
  //   }
    
  //   try {
  //     const user = await this.userModel.findByEmail(email);
  //     if (!user) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "User not found",
  //       });
  //     }
  //     const token = jwt.sign(
  //       { userId: user.id, email: user.email, userType: user.role },
  //       process.env.JWT_SECRET || "default_secret_key",
  //       { expiresIn: "7d" }
  //     );
  //     await this.userModel.updateToken(user.id, token);
  //     await sendMail({
  //       to: user.email,
  //       subject: "Reset Password",
  //       html: `
  //         <div>
  //           <p>Hello,</p>
  //           <p>Click the link below to reset your password:</p>
  //           <a href="${baseUrl}/dashboard/auth/reset-password?token=${token}">Reset Password</a>
  //           <p>If you did not request a password reset, please ignore this email.</p>
  //         </div>
  //       `,
  //     });
  //     return res.status(200).json({
  //       success: true,
  //       message: "Reset password email sent",
  //     });
  //   } catch (error) {
  //     console.error("Error sending reset password email:", error);
  //     return res.status(500).json({
  //       success: false,
  //       message: "An error occurred while sending the reset password email",
  //     });
  //   }
    
  // }
}

module.exports = AuthController;
