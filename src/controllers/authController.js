const jwt = require('jsonwebtoken');
const { User,Outlet } = require('../models');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User Inactiveee' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Password Not Matched' });
    }

    if (user.expiryDate && new Date() > user.expiryDate) {
      return res.status(401).json({ error: 'Account expired' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      token,
      user: user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.outletLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const outlet = await Outlet.findOne({
      where: { email }
    });

    if (!outlet || !outlet.isActive) {
      return res.status(401).json({
        error: 'Invalid credentials or outlet inactive'
      });
    }

    const isPasswordValid =
      await outlet.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: outlet.id,
        email: outlet.email,
        role: 'outlet',
        storeId: outlet.storeId,
        managerId: outlet.managerId
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRE
      }
    );

    const outletData = outlet.toJSON();
    delete outletData.password;

    return res.status(200).json({
      message: 'Outlet login successful',
      token,
      outlet: outletData
    });

  } catch (error) {
    console.error('Outlet login error:', error);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};