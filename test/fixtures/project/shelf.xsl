<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:shelf="urn:shelf" version="2.0">
  <xsl:function name="shelf:greeting">
    <xsl:value-of select="child::title"/>
  </xsl:function>
  <xsl:template match="book">
    <xsl:if test="count(page) > 0">
      <xsl:value-of select="child::author"/>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
