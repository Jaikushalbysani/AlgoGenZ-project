"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHospitalList = exports.resendOtphospital = exports.verifyOtpControllerhospital = exports.hospitalSignin = exports.hospitalSignup = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const email_1 = require("../utils/email");
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
// Hospital signup
const hospitalSignup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, slno, name, phone } = req.body;
        // Validate required fields
        if (!email || !password || !slno || !name || !phone) {
            return res.status(400).json({
                message: "All fields are required",
            });
        }
        // First, check if hospital exists in our seeded data and validate both slno and name
        const hospitalData = yield prisma.hospitalData.findFirst({
            where: {
                AND: [{ slno: parseInt(slno) }, { hospital_name: name }],
            },
        });
        if (!hospitalData) {
            return res.status(400).json({
                message: "Hospital ID and name do not match our records. Please verify your information.",
            });
        }
        // If hospital ID exists but name doesn't match
        const hospitalWithId = yield prisma.hospitalData.findUnique({
            where: { slno: parseInt(slno) },
        });
        if (hospitalWithId && hospitalWithId.hospital_name !== name) {
            return res.status(400).json({
                message: "Hospital name does not match the registered ID. Please verify your information.",
            });
        }
        // Check if hospital is already registered
        const existingHospital = yield prisma.hospital.findFirst({
            where: {
                OR: [{ email }, { slno: parseInt(slno) }, { phone }],
            },
        });
        if (existingHospital) {
            let message = "Registration failed: ";
            if (existingHospital.email === email) {
                message += "Email already registered";
            }
            else if (existingHospital.slno === parseInt(slno)) {
                message += "Hospital ID already registered";
            }
            else {
                message += "Phone number already registered";
            }
            message += existingHospital.isVerified
                ? "."
                : ". Registration pending verification. Please check your email.";
            return res.status(400).json({ message });
        }
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Create new hospital registration
        const hospital = yield prisma.hospital.create({
            data: {
                slno: parseInt(slno),
                name: hospitalData.hospital_name, // Use the exact name from database
                email,
                password: hashedPassword,
                phone,
                otp,
            },
            include: {
                hospitalData: true,
            },
        });
        // Send OTP via email
        yield (0, email_1.sendEmail)(email, "Verify Your Hospital Account", `Welcome to Child Connect! Your verification code is: ${otp}`);
        return res.status(201).json({
            message: "Please verify your email to complete signup",
            email,
            hospitalName: hospital.name,
        });
    }
    catch (error) {
        console.error("Hospital signup error:", error);
        return res.status(500).json({
            message: "Signup failed",
            error: error.message,
        });
    }
});
exports.hospitalSignup = hospitalSignup;
// Hospital signin
const hospitalSignin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }
        // Check if hospital exists with related data
        const hospital = yield prisma.hospital.findUnique({
            where: { email },
            include: {
                hospitalData: true,
            },
        });
        if (!hospital) {
            return res.status(404).json({
                message: "Hospital not found",
            });
        }
        if (!hospital.isVerified) {
            return res.status(401).json({
                message: "Please verify your email first",
            });
        }
        // Compare password
        const isMatch = yield bcrypt_1.default.compare(password, hospital.password);
        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid credentials",
            });
        }
        // Generate JWT Token
        const token = jsonwebtoken_1.default.sign({ hospitalId: hospital.id }, JWT_SECRET, {
            expiresIn: "7d",
        });
        return res.status(200).json({
            message: "Signin successful",
            token,
            hospital: Object.assign({ id: hospital.id, email: hospital.email, name: hospital.name, slno: hospital.slno }, (hospital.hospitalData && {
                zone: hospital.hospitalData.zone,
                ward: hospital.hospitalData.ward,
                address: hospital.hospitalData.address,
            })),
        });
    }
    catch (error) {
        console.error("Hospital signin error:", error);
        return res.status(500).json({
            message: "Signin failed",
            error: error.message,
        });
    }
});
exports.hospitalSignin = hospitalSignin;
// Verify OTP for hospital
const verifyOtpControllerhospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required",
            });
        }
        // Find hospital with related data
        const hospital = yield prisma.hospital.findUnique({
            where: { email },
            include: {
                hospitalData: true,
            },
        });
        if (!hospital) {
            return res.status(404).json({
                message: "Hospital not found",
            });
        }
        if (hospital.otp !== otp) {
            return res.status(400).json({
                message: "Invalid OTP",
            });
        }
        // Update hospital verification status
        const updatedHospital = yield prisma.hospital.update({
            where: { email },
            data: {
                isVerified: true,
                otp: null,
            },
            include: {
                hospitalData: true,
            },
        });
        // Generate JWT Token
        const token = jsonwebtoken_1.default.sign({ hospitalId: hospital.id }, JWT_SECRET, {
            expiresIn: "7d",
        });
        return res.status(200).json({
            message: "Email verified successfully",
            token,
            hospital: Object.assign({ id: updatedHospital.id, email: updatedHospital.email, name: updatedHospital.name, slno: updatedHospital.slno }, (updatedHospital.hospitalData && {
                zone: updatedHospital.hospitalData.zone,
                ward: updatedHospital.hospitalData.ward,
                address: updatedHospital.hospitalData.address,
            })),
        });
    }
    catch (error) {
        console.error("Hospital OTP verification error:", error);
        return res.status(500).json({
            message: "Verification failed",
            error: error.message,
        });
    }
});
exports.verifyOtpControllerhospital = verifyOtpControllerhospital;
// Resend OTP for hospital
const resendOtphospital = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                message: "Email is required",
            });
        }
        const hospital = yield prisma.hospital.findUnique({
            where: { email },
        });
        if (!hospital) {
            return res.status(404).json({
                message: "Hospital not found",
            });
        }
        // Generate new OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Update hospital with new OTP
        yield prisma.hospital.update({
            where: { email },
            data: { otp },
        });
        // Send new OTP via email
        yield (0, email_1.sendEmail)(email, "Your New Verification Code", `Your new verification code is: ${otp}`);
        return res.status(200).json({
            message: "New OTP sent successfully",
        });
    }
    catch (error) {
        console.error("Resend hospital OTP error:", error);
        return res.status(500).json({
            message: "Failed to resend OTP",
            error: error.message,
        });
    }
});
exports.resendOtphospital = resendOtphospital;
// Get hospital list for dropdown
const getHospitalList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospitals = yield prisma.hospitalData.findMany({
            select: {
                slno: true,
                hospital_name: true,
                zone: true,
                ward: true,
                address: true,
            },
            orderBy: {
                slno: "asc",
            },
        });
        return res.status(200).json({
            hospitals: hospitals.map((hospital) => ({
                value: hospital.slno,
                label: hospital.hospital_name,
                zone: hospital.zone,
                ward: hospital.ward,
                address: hospital.address,
            })),
        });
    }
    catch (error) {
        console.error("Get hospital list error:", error);
        return res.status(500).json({
            message: "Failed to fetch hospital list",
            error: error.message,
        });
    }
});
exports.getHospitalList = getHospitalList;
