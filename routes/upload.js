var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/upload')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let roleModel = require('../schemas/roles')
let userModel = require('../schemas/users')
let mongoose = require('mongoose')
let slugify = require('slugify')
let { RandomToken } = require('../utils/GenToken')
let { sendUserPasswordMail } = require('../utils/senMailHandler')

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, "../uploads", req.params.filename);
    res.sendFile(pathFile)
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];
    let result = [];
    let categories = await categoryModel.find({});
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title);
    let getSku = products.map(p => p.sku)
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let rowErrors = [];
        const cells = worksheet.getRow(row);
        let sku = cells.getCell(1).value;
        let title = cells.getCell(2).value;
        let category = cells.getCell(3).value;//hop le
        let price = Number.parseInt(cells.getCell(4).value);
        let stock = Number.parseInt(cells.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            rowErrors.push("price phai so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowErrors.push("stock phai so duong")
        }
        if (!categoriesMap.has(category)) {
            rowErrors.push('category khong hop le')
        }
        if (getTitle.includes(title)) {
            rowErrors.push('title da ton tai')
        }
        if (getSku.includes(sku)) {
            rowErrors.push('sku da ton tai')
        }
        if (rowErrors.length > 0) {
            result.push(rowErrors);
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newObj = new productModel({
                sku:sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-', lower: true, locale: 'vi',
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category)
            })
            await newObj.save({ session })
            let newInventory = new inventoryModel({
                product: newObj._id,
                stock: stock
            })
            await newInventory.save({ session })
            await session.commitTransaction();
            await session.endSession()
            await newInventory.populate('product')
            getSku.push(sku);
            getTitle.push(title)
            result.push(newInventory);
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push(error.message);
        }
        //khong co loi
    }
    res.send(result)
})

router.post('/users_excel', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(400).send({ message: "file khong duoc de trong" })
    }

    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];

    let userRole = await roleModel.findOne({
        name: { $regex: /^user$/i },
        isDeleted: false
    })

    if (!userRole) {
        return res.status(400).send({
            message: "khong tim thay role user"
        })
    }

    let existedUsers = await userModel.find({}, { username: 1, email: 1 })
    let usernameSet = new Set(existedUsers.map(u => String(u.username).toLowerCase()))
    let emailSet = new Set(existedUsers.map(u => String(u.email).toLowerCase()))

    let result = [];
    for (let row = 2; row <= worksheet.rowCount; row++) {
        const cells = worksheet.getRow(row);
        // Use cell.text to correctly read formula cells (e.g. CONCAT) as resolved strings.
        let username = String(cells.getCell(1).text || '').trim();
        let email = String(cells.getCell(2).text || '').trim().toLowerCase();
        let rowErrors = []

        if (!username) {
            rowErrors.push('username khong duoc rong')
        }
        if (username && !/^[a-zA-Z0-9]+$/.test(username)) {
            rowErrors.push('username khong duoc chua ki tu dac biet')
        }
        if (!email) {
            rowErrors.push('email khong duoc rong')
        }
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            rowErrors.push('email sai dinh dang')
        }
        if (usernameSet.has(username.toLowerCase())) {
            rowErrors.push('username da ton tai')
        }
        if (emailSet.has(email)) {
            rowErrors.push('email da ton tai')
        }

        if (rowErrors.length > 0) {
            result.push({
                row,
                status: 'failed',
                errors: rowErrors
            })
            continue;
        }

        let randomPassword = RandomToken(16)
        try {
            let newUser = new userModel({
                username,
                email,
                password: randomPassword,
                role: userRole._id
            })
            await newUser.save()
            await sendUserPasswordMail(email, username, randomPassword)
            usernameSet.add(username.toLowerCase())
            emailSet.add(email)
            result.push({
                row,
                status: 'success',
                username,
                email,
                message: 'tao user va gui mail thanh cong'
            })
        } catch (error) {
            result.push({
                row,
                status: 'failed',
                username,
                email,
                errors: [error.message]
            })
        }
    }

    res.send(result)
})



module.exports = router;