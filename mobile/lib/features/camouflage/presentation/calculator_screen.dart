import 'package:flutter/material.dart';
import 'package:math_expressions/math_expressions.dart';

class CalculatorScreen extends StatefulWidget {
  final Function() onUnlock;
  const CalculatorScreen({super.key, required this.onUnlock});

  @override
  State<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends State<CalculatorScreen> {
  String _display = "0";
  String _expression = "";
  
  // MAGIC TRIGGER: Si le résultat du calcul donne cette valeur, on déverrouille.
  // Exemple: 1330 + 7 = 1337 -> Login
  static const String MAGIC_RESULT = "1337";

  void _onDigitPress(String digit) {
    setState(() {
      if (_display == "0" || _display == "Error") {
        _display = digit;
        _expression = digit;
      } else {
        _display += digit;
        _expression += digit;
      }
    });
  }

  void _onOperatorPress(String op) {
    setState(() {
      // Éviter double opérateur
      if (_expression.isNotEmpty && !"+-*/".contains(_expression[_expression.length - 1])) {
        _expression += op;
        _display += op;
      }
    });
  }

  void _clear() {
    setState(() {
      _display = "0";
      _expression = "";
    });
  }

  void _calculate() {
    if (_expression.isEmpty) return;

    try {
      Parser p = Parser();
      Expression exp = p.parse(_expression);
      ContextModel cm = ContextModel();
      double eval = exp.evaluate(EvaluationType.REAL, cm);

      // Formattage du résultat (entier si possible)
      String resultStr;
      if (eval % 1 == 0) {
        resultStr = eval.toInt().toString();
      } else {
        resultStr = eval.toString();
      }

      // Check MAGIC TRIGGER
      if (resultStr == MAGIC_RESULT) {
        widget.onUnlock();
        _clear(); // Reset pour la prochaine fois
        return;
      }

      setState(() {
        _display = resultStr;
        // On permet de continuer le calcul sur le résultat
        _expression = resultStr; 
      });

    } catch (e) {
      setState(() {
        _display = "Error";
         _expression = "";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea( // Ajout SafeArea pour éviter notch
        child: Column(
          children: [
            Expanded(
              child: Container(
                alignment: Alignment.bottomRight,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Text(
                  _display,
                  style: const TextStyle(color: Colors.white, fontSize: 64, fontWeight: FontWeight.w300),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            const Divider(color: Colors.grey),
            _buildKeypad(),
          ],
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    return Container(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          _buildRow(["7", "8", "9", "/"]),
          _buildRow(["4", "5", "6", "*"]),
          _buildRow(["1", "2", "3", "-"]),
          _buildRow(["C", "0", "=", "+"]),
        ],
      ),
    );
  }

  Widget _buildRow(List<String> keys) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: keys.map((key) => _buildButton(key)).toList(),
    );
  }

  Widget _buildButton(String label) {
    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: MaterialButton(
        onPressed: () {
          if (label == "C") _clear();
          else if (label == "=") _calculate();
          else if (["+", "-", "*", "/"].contains(label)) _onOperatorPress(label);
          else _onDigitPress(label);
        },
        color: _getButtonColor(label),
        textColor: Colors.white,
        shape: const CircleBorder(),
        height: 80,
        minWidth: 80,
        elevation: 0,
        highlightElevation: 0,
        child: Text(label, style: const TextStyle(fontSize: 32, fontWeight: FontWeight.normal)),
      ),
    );
  }

  Color _getButtonColor(String label) {
    if (label == "=") return Colors.orange;
    if (["+", "-", "*", "/"].contains(label)) return Colors.orange; // iOS Style operators
    if (label == "C") return Colors.grey;
    return const Color(0xFF333333); // Dark Gray
  }
}
