const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "a7533dcc4d26fc",
        pass: process.env.MAILTRAP_PASS || "01338a2cf396dc",
    },
});
//http://localhost:3000/api/v1/auth/resetpassword/a87edf6812f235e997c7b751422e6b2f5cd95aa994c55ebeeb931ca67214d645

// Send an email using async/await;
module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@hehehe.com',
            to: to,
            subject: "reset pass",
            text: "click vo day de doi pass", // Plain-text version of the message
            html: "click vo <a href=" + url + ">day</a> de doi pass", // HTML version of the message
        });
    },
    sendUserPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@hehehe.com',
            to: to,
            subject: "Thong tin tai khoan moi",
            text: `Tai khoan cua ban da duoc tao. Username: ${username}. Password tam thoi: ${password}`,
            html: `<p>Tai khoan cua ban da duoc tao.</p><p><b>Username:</b> ${username}</p><p><b>Password tam thoi:</b> ${password}</p><p>Hay doi mat khau ngay sau khi dang nhap.</p>`,
        })
    }
}