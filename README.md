# 🎱 Snooker Parlor Calculator

A simple, elegant web-based calculator designed for snooker parlors to track table usage and calculate billing for up to 8 tables.

## ✨ Features

- **8 Table Management**: Individual tracking for up to 8 snooker tables
- **Visual Table Representation**: Realistic snooker table design with green felt and black pockets
- **Flexible Hourly Rates**: Set different rates for each table
- **Real-time Calculations**: Automatic updates as you type
- **Enter Key Support**: Press Enter in hours field for quick calculation
- **Grand Total**: Automatic sum of all table charges
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Glass-morphism design with smooth animations

## 🚀 Demo

![Snooker Calculator Preview](https://via.placeholder.com/800x600/0f4c3a/ffffff?text=Snooker+Calculator+Preview)

## 📱 Usage

1. **Set Rates**: Adjust the hourly rate for each table (default: ₹100/hour)
2. **Enter Hours**: Input the number of hours played (supports decimals like 1.5)
3. **Calculate**: Press Enter or click the Calculate button
4. **View Totals**: See individual table costs and the grand total

## 🛠️ Installation

### Option 1: Direct Download
1. Download the `index.html` file
2. Open it in any web browser
3. Start calculating!

### Option 2: Clone Repository
```bash
git clone https://github.com/arsalan507/SnookerParlorManagement.git
cd SnookerParlorManagement
```

### Option 3: GitHub Pages
Deploy directly to GitHub Pages:
1. Fork this repository
2. Go to Settings > Pages
3. Select source branch
4. Access via: `https://arsalan507.github.io/SnookerParlorManagement`

## 💻 Technical Details

- **Pure HTML/CSS/JavaScript**: No external dependencies
- **Responsive Grid Layout**: Adapts to different screen sizes
- **Local Storage**: Not used - all data is session-based
- **Modern CSS**: Uses backdrop-filter, flexbox, and grid
- **Cross-browser Compatible**: Works on all modern browsers

## 🎨 Customization

### Changing Default Rates
Edit the `value` attribute in the rate input fields:
```html
<input type="number" id="rate1" value="150" min="0" step="10">
```

### Modifying Colors
Update the CSS variables in the `:root` selector or modify the gradient:
```css
background: linear-gradient(135deg, #0f4c3a, #1a5c47);
```

### Adding More Tables
1. Copy a table card HTML structure
2. Update the IDs (rate9, hours9, total9)
3. Add corresponding JavaScript functionality

## 📋 Features Breakdown

| Feature | Description |
|---------|-------------|
| **Table Visual** | CSS-based snooker table with realistic appearance |
| **Hourly Rates** | Customizable rates per table |
| **Time Tracking** | Support for decimal hours (e.g., 1.5 hours) |
| **Auto-calculation** | Real-time updates without page refresh |
| **Grand Total** | Automatic summation of all table charges |
| **Keyboard Support** | Enter key for quick calculations |
| **Mobile Friendly** | Responsive design for all devices |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines
- Keep the design simple and functional
- Maintain cross-browser compatibility
- Follow existing code style
- Test on mobile devices

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Use Cases

- **Snooker Parlors**: Track table usage and billing
- **Pool Halls**: Adapt for pool table management
- **Gaming Centers**: Modify for other hourly-rate activities
- **Small Businesses**: Template for time-based billing systems

## 🔧 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 📞 Support

If you encounter any issues or have suggestions for improvements, please:
1. Check existing [Issues](https://github.com/arsalan507/SnookerParlorManagement/issues)
2. Create a new issue with detailed description
3. Include browser and device information

## 🚀 Future Enhancements

- [ ] Timer functionality for active sessions
- [ ] Customer name tracking
- [ ] Print receipt functionality
- [ ] Data export (CSV/PDF)
- [ ] Multi-day session tracking
- [ ] Discount management
- [ ] Table booking system

## ⭐ Show Your Support

Give a ⭐️ if this project helped you!

---

**Made with ❤️ for snooker parlor owners**